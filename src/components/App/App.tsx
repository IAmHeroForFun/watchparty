import React from "react";
import { Button, ActionIcon, TextInput, Badge, Text } from "@mantine/core";
import io, { Socket } from "socket.io-client";
import {
  iceServers,
  serverPath,
  getOrCreateClientId,
  getOrCreateSessionId,
  isScreenShare,
} from "../../utils/utils";
import { generateName } from "../../utils/generateName";
import { Chat } from "../Chat/Chat";
import { TopBar } from "../TopBar/TopBar";
import { VideoChat } from "../VideoChat/VideoChat";
import {
  IconScreenShare,
  IconScreenShareOff,
  IconUser,
  IconCopy,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconUsersGroup,
  IconMaximize,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import styles from "./App.module.css";

declare global {
  interface Window {
    watchparty: {
      ourStream: MediaStream | undefined;
      videoRefs: HTMLVideoElementDict;
      videoPCs: PCDict;
    };
  }
}

window.watchparty = {
  ourStream: undefined,
  videoRefs: {},
  videoPCs: {},
};

const clientId = getOrCreateClientId();

interface AppProps {
  vanity?: string;
  urlRoomId?: string;
  isAdmin?: boolean;
}

interface AppState {
  roomMedia: string;
  participants: User[];
  rosterUpdateTS: number;
  chat: ChatMessage[];
  nameMap: StringDict;
  pictureMap: StringDict;
  tsMap: NumberDict;
  myName: string;
  showChatColumn: boolean;
  copiedLink: boolean;
  isAdmin: boolean;
  needsUserUnmute: boolean;
  isMuted: boolean;
}

export class App extends React.Component<AppProps, AppState> {
  socket: Socket;
  roomId: string;
  publisherConns: PCDict = {};
  consumerConn: RTCPeerConnection | undefined = undefined;
  localStreamToPublish: MediaStream | undefined = undefined;
  remoteStream: MediaStream = new MediaStream();
  videoRef = React.createRef<HTMLVideoElement>();
  chatRef = React.createRef<Chat>();
  iceCandidateQueue: { [id: string]: RTCIceCandidateInit[] } = {};
  keepAliveAudioCtx: AudioContext | null = null;

  constructor(props: AppProps) {
    super(props);
    const rawId = props.urlRoomId || props.vanity || "live-stream";
    this.roomId = rawId.replace(/^\//, "");

    const sessionId = getOrCreateSessionId();
    const adminToken =
      window.localStorage.getItem("streamparty-admin-token") || "";

    this.socket = io(`${serverPath}/${this.roomId}`, {
      query: { clientId, roomId: this.roomId, adminToken },
      auth: { sessionId, adminToken },
      transports: ["websocket", "polling"],
    });

    this.state = {
      roomMedia: "",
      participants: [],
      rosterUpdateTS: Date.now(),
      chat: [],
      nameMap: {},
      pictureMap: {},
      tsMap: {},
      myName: window.localStorage.getItem("streamparty-username") || "",
      showChatColumn: true,
      copiedLink: false,
      isAdmin: Boolean(
        props.isAdmin ||
          window.localStorage.getItem("streamparty-admin-token"),
      ),
      needsUserUnmute: true,
      isMuted: true,
    };
  }

  async componentDidMount() {
    if (!this.state.myName) {
      const generated = await generateName();
      this.updateName(generated);
    }

    const socket = this.socket;
    const adminToken =
      window.localStorage.getItem("streamparty-admin-token") || "";

    socket.on("REC:isAdmin", (isAdmin: boolean) => {
      this.setState({ isAdmin });
    });

    socket.on("connect", () => {
      if (this.state.myName) {
        socket.emit("CMD:name", this.state.myName);
      }
      if (adminToken) {
        socket.emit("CMD:authAdmin", adminToken);
      }
    });

    socket.on("REC:host", (data: HostState) => {
      const currentMedia = data.video || "";
      const wasSharing = this.playingScreenShare();
      this.setState({ roomMedia: currentMedia }, () => {
        if (wasSharing && !isScreenShare(currentMedia)) {
          this.stopPublishingLocalStream();
        }
        this.setupRTCConnections();
      });
    });

    socket.on("roster", (participants: User[]) => {
      this.setState(
        {
          participants,
          rosterUpdateTS: Date.now(),
        },
        () => {
          this.setupRTCConnections();
        },
      );
    });

    socket.on("REC:nameMap", (nameMap: StringDict) => {
      this.setState({ nameMap });
    });

    socket.on("REC:pictureMap", (pictureMap: StringDict) => {
      this.setState({ pictureMap });
    });

    socket.on("chatinit", (chat: ChatMessage[]) => {
      this.setState({ chat });
    });

    socket.on("REC:chat", (chatMsg: ChatMessage) => {
      this.setState((prev) => ({ chat: [...prev.chat, chatMsg].slice(-100) }));
    });

    socket.on("REC:addReaction", (reaction: Reaction) => {
      this.setState((prev) => {
        const chat = prev.chat.map((m) => {
          if (m.id === reaction.msgId && m.timestamp === reaction.msgTimestamp) {
            const reactions = m.reactions || {};
            const userList = reactions[reaction.value] || [];
            if (!userList.includes(reaction.user)) {
              return {
                ...m,
                reactions: {
                  ...reactions,
                  [reaction.value]: [...userList, reaction.user],
                },
              };
            }
          }
          return m;
        });
        return { chat };
      });
    });

    socket.on("REC:removeReaction", (reaction: Reaction) => {
      this.setState((prev) => {
        const chat = prev.chat.map((m) => {
          if (m.id === reaction.msgId && m.timestamp === reaction.msgTimestamp) {
            const reactions = m.reactions || {};
            const userList = (reactions[reaction.value] || []).filter(
              (u) => u !== reaction.user,
            );
            return {
              ...m,
              reactions: {
                ...reactions,
                [reaction.value]: userList,
              },
            };
          }
          return m;
        });
        return { chat };
      });
    });

    socket.on("signalSS", this.handleSignalSS);
  }

  componentDidUpdate() {
    this.syncVideoStream();
  }

  componentWillUnmount() {
    this.stopKeepAlive();
    this.stopPublishingLocalStream();
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  startKeepAlive = () => {
    if (!this.keepAliveAudioCtx) {
      try {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.00001; // virtually silent keep-alive
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          this.keepAliveAudioCtx = ctx;
        }
      } catch (e) {
        console.warn("Could not start keep-alive audio context:", e);
      }
    }
  };

  stopKeepAlive = () => {
    if (this.keepAliveAudioCtx) {
      try {
        this.keepAliveAudioCtx.close();
      } catch (e) {}
      this.keepAliveAudioCtx = null;
    }
  };

  syncVideoStream = () => {
    const video = this.videoRef.current;
    if (!video) return;

    if (this.localStreamToPublish) {
      if (video.srcObject !== this.localStreamToPublish) {
        video.srcObject = this.localStreamToPublish || null;
        video.muted = true; // Presenter muted to prevent audio feedback loop
        video.play().catch(console.warn);
      }
    } else if (this.remoteStream && this.remoteStream.getTracks().length > 0) {
      if (video.srcObject !== this.remoteStream) {
        video.srcObject = this.remoteStream || null;
        video.playsInline = true;
        if (this.state.isMuted) {
          video.muted = true;
        }
        this.attemptPlayVideo();
      } else if (video.paused) {
        this.attemptPlayVideo();
      }
    } else {
      if (video.srcObject) {
        video.srcObject = null;
      }
    }
  };

  attemptPlayVideo = () => {
    const video = this.videoRef.current;
    if (!video) return;

    video.play().catch(async (err: any) => {
      // Browser blocked autoplay due to unmuted audio policy
      video.muted = true;
      try {
        await video.play();
        this.setState({ needsUserUnmute: true, isMuted: true });
      } catch (e) {
        console.warn("Muted playback attempt also failed:", e);
      }
    });
  };

  unmuteAudio = () => {
    const video = this.videoRef.current;
    if (video) {
      video.muted = false;
      video.play().catch(console.warn);
      this.setState({ needsUserUnmute: false, isMuted: false });
    }
  };

  toggleFullscreen = () => {
    const video = this.videoRef.current;
    if (!video) return;

    if (!document.fullscreenElement) {
      if (video.requestFullscreen) {
        video.requestFullscreen().catch(console.warn);
      } else if ((video as any).webkitRequestFullscreen) {
        (video as any).webkitRequestFullscreen();
      } else if ((video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen(); // Mobile Safari
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(console.warn);
      }
    }
  };

  playingScreenShare = () => {
    return Boolean(
      this.localStreamToPublish || isScreenShare(this.state.roomMedia)
    );
  };

  getSharer = () => {
    return this.state.participants.find((p) => p.isScreenShare);
  };

  updateName = (name: string) => {
    if (!name) return;
    this.setState({ myName: name });
    if (this.socket) {
      this.socket.emit("CMD:name", name);
    }
    window.localStorage.setItem("streamparty-username", name);
  };

  copyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    this.setState({ copiedLink: true });
    setTimeout(() => this.setState({ copiedLink: false }), 2000);
  };

  startScreenShare = async () => {
    if (!this.state.isAdmin) {
      alert("Only the room administrator can broadcast a stream.");
      return;
    }
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 60, max: 60 },
            height: { ideal: 1080 },
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          if ("contentHint" in videoTrack) {
            (videoTrack as any).contentHint = "motion";
          }
          videoTrack.onended = () => {
            this.stopPublishingLocalStream();
          };
        }

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && "contentHint" in audioTrack) {
          (audioTrack as any).contentHint = "music";
        }

        this.localStreamToPublish = stream;
        this.startKeepAlive();
        this.socket.emit("CMD:joinScreenShare", { file: false });
        this.setupRTCConnections();
        this.syncVideoStream();
        this.forceUpdate();
      } catch (e) {
        console.warn("Screen share cancelled or failed:", e);
      }
    }
  };

  stopPublishingLocalStream = () => {
    this.stopKeepAlive();
    if (this.localStreamToPublish) {
      this.localStreamToPublish.getTracks().forEach((track) => track.stop());
      this.localStreamToPublish = undefined;
    }
    if (this.videoRef.current) {
      this.videoRef.current.srcObject = null;
    }
    Object.values(this.publisherConns).forEach((pc) => pc.close());
    this.publisherConns = {};

    if (this.socket) {
      this.socket.emit("CMD:leaveScreenShare");
    }
    this.forceUpdate();
  };

  setupRTCConnections = async () => {
    if (!this.playingScreenShare()) {
      return;
    }

    const sharer = this.getSharer();
    const selfId = clientId;

    // IF WE ARE THE PRESENTER (SHARER)
    if (sharer?.id === selfId && this.localStreamToPublish) {
      const activeUserIds = new Set(this.state.participants.map((p) => p.id));

      // Close stale peer connections for members who disconnected
      Object.entries(this.publisherConns).forEach(([peerId, pc]) => {
        if (!activeUserIds.has(peerId)) {
          pc.close();
          delete this.publisherConns[peerId];
        }
      });

      // Establish connections to every viewer
      this.state.participants.forEach((user) => {
        const id = user.id;
        if (id === selfId || this.publisherConns[id]) {
          return;
        }

        const pc = new RTCPeerConnection({ iceServers: iceServers() });
        this.publisherConns[id] = pc;

        this.localStreamToPublish?.getTracks().forEach((track) => {
          if (this.localStreamToPublish) {
            const sender = pc.addTrack(track, this.localStreamToPublish);
            if (track.kind === "video") {
              try {
                const params = sender.getParameters();
                if (params) {
                  // Balanced degradation dynamically scales resolution between 1080p, 720p, 480p based on viewer bandwidth
                  params.degradationPreference = "balanced";
                  if (!params.encodings || params.encodings.length === 0) {
                    params.encodings = [{}];
                  }
                  // Cap max bitrate at 4 Mbps (crisp 1080p)
                  params.encodings[0].maxBitrate = 4000000;
                  params.encodings[0].maxFramerate = 60;
                  sender.setParameters(params).catch(() => {});
                }
              } catch (e) {}
            }
          }
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignalSS(id, { ice: event.candidate }, true);
          }
        };

        const createAndSendOffer = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignalSS(id, { sdp: pc.localDescription }, true);
          } catch (e) {
            console.warn("Offer creation error:", e);
          }
        };

        pc.onnegotiationneeded = createAndSendOffer;
        // Explicitly trigger offer immediately so we do not miss asynchronous dispatch
        createAndSendOffer();
      });
    }

    // IF WE ARE A VIEWER (WATCHER)
    if (sharer && sharer.id !== selfId && !this.consumerConn) {
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      this.consumerConn = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignalSS(sharer.id, { ice: event.candidate });
        }
      };

      pc.ontrack = (event: RTCTrackEvent) => {
        // Direct native MediaStream assignment for mobile WebKit (Safari / Chrome)
        if (event.streams && event.streams[0]) {
          this.remoteStream = event.streams[0];
        } else {
          if (!this.remoteStream) {
            this.remoteStream = new MediaStream();
          }
          if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
            this.remoteStream.addTrack(event.track);
          }
        }
        this.syncVideoStream();
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed") {
          pc.close();
          this.consumerConn = undefined;
          this.setupRTCConnections();
        }
      };
    }
  };

  enqueueOrAddIceCandidate = async (
    peerId: string,
    pc: RTCPeerConnection,
    candidate: RTCIceCandidateInit,
  ) => {
    try {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        if (!this.iceCandidateQueue[peerId]) {
          this.iceCandidateQueue[peerId] = [];
        }
        this.iceCandidateQueue[peerId].push(candidate);
      }
    } catch (e) {
      console.warn("ICE candidate add error:", e);
    }
  };

  drainIceCandidateQueue = async (peerId: string, pc: RTCPeerConnection) => {
    const queue = this.iceCandidateQueue[peerId];
    if (queue && queue.length > 0) {
      delete this.iceCandidateQueue[peerId];
      for (const cand of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
          console.warn("Queued ICE candidate add error:", e);
        }
      }
    }
  };

  handleSignalSS = async (data: any) => {
    const msg = data.msg;
    const from = data.from;
    const sharer = this.getSharer();
    const selfId = clientId;

    if (sharer?.id === selfId) {
      const pc = this.publisherConns[from];
      if (!pc) return;
      if (msg.ice !== undefined) {
        await this.enqueueOrAddIceCandidate(from, pc, msg.ice);
      } else if (msg.sdp && msg.sdp.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await this.drainIceCandidateQueue(from, pc);
      }
    } else {
      if (!this.consumerConn) {
        await this.setupRTCConnections();
      }
      const pc = this.consumerConn;
      if (!pc) return;
      if (msg.ice !== undefined) {
        await this.enqueueOrAddIceCandidate(from, pc, msg.ice);
      } else if (msg.sdp && msg.sdp.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await this.drainIceCandidateQueue(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignalSS(from, { sdp: pc.localDescription });
      }
    }
  };

  sendSignalSS = (to: string, data: any, sharer?: boolean) => {
    if (this.socket) {
      this.socket.emit("signalSS", { to, msg: data, sharer });
    }
  };

  getLeaderTime = () => 0;

  render() {
    const sharer = this.getSharer();
    const isHostSharer = Boolean(
      this.localStreamToPublish || (sharer && sharer.id === clientId),
    );
    const sharerName = isHostSharer
      ? this.state.myName || "You (Host)"
      : sharer
        ? this.state.nameMap[sharer.id] || sharer.id
        : "Broadcaster";

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          backgroundColor: "#08080a",
          color: "#f1f5f9",
          overflow: "hidden",
        }}
      >
        <TopBar />

        <div className={styles.mainContainer}>
          {/* Main Stage (Screen Share Viewport) */}
          <div className={styles.streamSection}>
            {this.playingScreenShare() ? (
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#000000",
                }}
              >
                {/* Status Badge */}
                <div className={styles.liveBadge}>
                  <span className={styles.liveDot} />
                  <Text size="xs" fw={700} c="red">
                    LIVE STREAM
                  </Text>
                  <Text size="xs" c="dimmed">
                    ({sharerName})
                  </Text>
                </div>

                {/* Top Right Overlay Controls */}
                <div className={styles.playerOverlayControls}>
                  {isHostSharer && (
                    <Button
                      color="red"
                      size="xs"
                      onClick={this.stopPublishingLocalStream}
                      leftSection={<IconScreenShareOff size={16} />}
                    >
                      Stop Sharing
                    </Button>
                  )}
                  <ActionIcon
                    size="sm"
                    color="gray"
                    variant="filled"
                    title="Toggle Fullscreen"
                    onClick={this.toggleFullscreen}
                  >
                    <IconMaximize size={16} />
                  </ActionIcon>
                </div>

                {/* Floating Unmute Banner if Browser Blocked Autoplay */}
                {this.state.needsUserUnmute && !isHostSharer && (
                  <div
                    className={styles.unmuteBanner}
                    onClick={this.unmuteAudio}
                  >
                    <IconVolumeOff size={18} />
                    <span>Click to Unmute Live Audio</span>
                  </div>
                )}

                {/* Hardware Accelerated Video Stream */}
                <video
                  ref={this.videoRef}
                  className={styles.videoElement}
                  autoPlay
                  playsInline
                  controls
                  muted={this.state.isMuted || isHostSharer}
                  onClick={
                    this.state.needsUserUnmute && !isHostSharer
                      ? this.unmuteAudio
                      : undefined
                  }
                />
              </div>
            ) : this.state.isAdmin ? (
              /* Admin Broadcaster Waiting Screen */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "40px",
                  borderRadius: "12px",
                  backgroundColor: "#121318",
                  border: "1px solid rgba(255, 46, 76, 0.2)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
                  textAlign: "center",
                  maxWidth: "480px",
                }}
              >
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 46, 76, 0.1)",
                    border: "1px solid rgba(255, 46, 76, 0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "16px",
                  }}
                >
                  <IconScreenShare size={36} color="#ff2e4c" />
                </div>
                <Text size="xl" fw={700} style={{ color: "#f8fafc", marginBottom: "8px" }}>
                  Broadcaster Studio
                </Text>
                <Text size="sm" c="dimmed" style={{ marginBottom: "24px", lineHeight: 1.5 }}>
                  You are the Room Admin. Click below to share your screen with system audio to all connected viewers.
                </Text>
                <Button
                  color="red"
                  size="md"
                  onClick={this.startScreenShare}
                  leftSection={<IconScreenShare size={20} />}
                  style={{
                    boxShadow: "0 0 16px rgba(255, 46, 76, 0.4)",
                  }}
                >
                  Start Screen Broadcast
                </Button>
              </div>
            ) : (
              /* Viewer Waiting Screen */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "48px 36px",
                  borderRadius: "12px",
                  backgroundColor: "#111216",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
                  textAlign: "center",
                  maxWidth: "480px",
                }}
              >
                <div
                  style={{
                    width: "72px",
                    height: "72px",
                    borderRadius: "50%",
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "18px",
                  }}
                >
                  <IconScreenShare size={36} color="#94a3b8" />
                </div>
                <Badge color="gray" variant="outline" size="md" mb="xs">
                  STREAM OFFLINE
                </Badge>
                <Text size="xl" fw={700} style={{ color: "#ffffff", marginBottom: "8px" }}>
                  Waiting for Host to Stream
                </Text>
                <Text size="sm" c="dimmed" style={{ lineHeight: 1.6 }}>
                  The host is currently not broadcasting. Sit tight — the stream will appear here automatically as soon as the host starts!
                </Text>
              </div>
            )}
          </div>

          {/* Right Sidebar (Voice, Users & Text Chat) */}
          <aside
            className={styles.sidebarSection}
            style={{
              display: this.state.showChatColumn ? "flex" : "none",
            }}
          >
            {/* User Profile & Invite Bar */}
            <div style={{ display: "flex", gap: "6px" }}>
              <TextInput
                style={{ flexGrow: 1 }}
                size="sm"
                value={this.state.myName}
                onChange={(e) => this.updateName(e.target.value)}
                leftSection={<IconUser size={16} />}
                rightSectionWidth={65}
                rightSection={
                  <Button
                    size="compact-xs"
                    color="red"
                    variant="subtle"
                    onClick={async () => this.updateName(await generateName())}
                  >
                    Random
                  </Button>
                }
              />
              <ActionIcon
                size="36px"
                color={this.state.copiedLink ? "green" : "red"}
                variant="filled"
                title="Copy Invite Link"
                onClick={this.copyInviteLink}
              >
                {this.state.copiedLink ? <IconCheck size={18} /> : <IconCopy size={18} />}
              </ActionIcon>
            </div>

            {/* Voice Chat Module */}
            {this.socket && (
              <VideoChat
                socket={this.socket}
                participants={this.state.participants}
                nameMap={this.state.nameMap}
                pictureMap={this.state.pictureMap}
                tsMap={this.state.tsMap}
                rosterUpdateTS={this.state.rosterUpdateTS}
                owner={undefined}
                getLeaderTime={this.getLeaderTime}
              />
            )}

            {/* Real-time Text Chat */}
            {this.socket && (
              <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <Chat
                  chat={this.state.chat}
                  nameMap={this.state.nameMap}
                  pictureMap={this.state.pictureMap}
                  socket={this.socket}
                  scrollTimestamp={0}
                  getMediaDisplayName={() => "Screen Share"}
                  isChatDisabled={false}
                  owner={undefined}
                  ref={this.chatRef}
                  hide={!this.state.showChatColumn}
                />
              </div>
            )}
          </aside>
        </div>
      </div>
    );
  }
}
