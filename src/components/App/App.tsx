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
}

export class App extends React.Component<AppProps, AppState> {
  socket: Socket = null as any;
  roomId = this.props.urlRoomId || this.props.vanity || "";
  publisherConns: PCDict = {};
  consumerConn: RTCPeerConnection | undefined = undefined;
  localStreamToPublish: MediaStream | undefined = undefined;
  chatRef = React.createRef<Chat>();

  state: AppState = {
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
      this.props.isAdmin ||
        window.localStorage.getItem("streamparty-admin-token"),
    ),
  };

  async componentDidMount() {
    if (!this.state.myName) {
      const generated = await generateName();
      this.updateName(generated);
    }

    const sessionId = getOrCreateSessionId();
    const adminToken =
      window.localStorage.getItem("streamparty-admin-token") || "";

    this.socket = io(`${serverPath}/${this.roomId}`, {
      query: { clientId, roomId: this.roomId, adminToken },
      auth: { sessionId, adminToken },
      transports: ["websocket"],
    });

    const socket = this.socket;

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

  componentWillUnmount() {
    this.stopPublishingLocalStream();
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  playingScreenShare = () => {
    return isScreenShare(this.state.roomMedia);
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
          video: { frameRate: 30, height: 1080 },
          audio: true,
        });

        this.localStreamToPublish = stream;

        // Automatically stop if user clicks browser's native "Stop Sharing" button
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            this.stopPublishingLocalStream();
          };
        }

        const leftVideo = document.getElementById("leftVideo") as HTMLVideoElement;
        if (leftVideo) {
          leftVideo.srcObject = stream;
          leftVideo.muted = true; // Mute locally to avoid audio feedback
          leftVideo.play().catch(console.warn);
        }

        this.socket.emit("CMD:joinScreenShare", { file: false });
        this.setupRTCConnections();
        this.forceUpdate();
      } catch (e) {
        console.warn("Screen share cancelled or failed:", e);
      }
    }
  };

  stopPublishingLocalStream = () => {
    if (this.localStreamToPublish) {
      this.localStreamToPublish.getTracks().forEach((track) => track.stop());
      this.localStreamToPublish = undefined;
    }
    const leftVideo = document.getElementById("leftVideo") as HTMLVideoElement;
    if (leftVideo) {
      leftVideo.srcObject = null;
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
            pc.addTrack(track, this.localStreamToPublish);
          }
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignalSS(id, { ice: event.candidate }, true);
          }
        };

        pc.onnegotiationneeded = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignalSS(id, { sdp: pc.localDescription }, true);
          } catch (e) {
            console.warn("Offer creation error:", e);
          }
        };
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
        const leftVideo = document.getElementById("leftVideo") as HTMLVideoElement;
        if (leftVideo) {
          leftVideo.srcObject = event.streams[0];
          leftVideo.play().catch(console.warn);
        }
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

  handleSignalSS = async (data: any) => {
    const msg = data.msg;
    const from = data.from;
    const sharer = this.getSharer();
    const selfId = clientId;

    if (sharer?.id === selfId) {
      const pc = this.publisherConns[from];
      if (!pc) return;
      if (msg.ice !== undefined) {
        pc.addIceCandidate(new RTCIceCandidate(msg.ice));
      } else if (msg.sdp && msg.sdp.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      }
    } else {
      if (!this.consumerConn) {
        await this.setupRTCConnections();
      }
      const pc = this.consumerConn;
      if (!pc) return;
      if (msg.ice !== undefined) {
        pc.addIceCandidate(new RTCIceCandidate(msg.ice));
      } else if (msg.sdp && msg.sdp.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
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
    const isHostSharer = sharer?.id === clientId;
    const sharerName = sharer ? this.state.nameMap[sharer.id] || sharer.id : "";

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

        <div
          style={{
            display: "flex",
            flexGrow: 1,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Main Stage (Screen Share Viewport) */}
          <div
            style={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              position: "relative",
              backgroundColor: "#050507",
              justifyContent: "center",
              alignItems: "center",
              padding: "12px",
            }}
          >
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
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid rgba(255, 46, 76, 0.3)",
                  boxShadow: "0 0 24px rgba(255, 46, 76, 0.15)",
                }}
              >
                {/* Status Badge */}
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    left: "12px",
                    zIndex: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "rgba(13, 14, 18, 0.8)",
                    backdropFilter: "blur(8px)",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    border: "1px solid rgba(255, 46, 76, 0.3)",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "#ff2e4c",
                      boxShadow: "0 0 8px #ff2e4c",
                    }}
                  />
                  <Text size="xs" fw={700} c="red">
                    LIVE SCREEN
                  </Text>
                  <Text size="xs" c="dimmed">
                    ({sharerName})
                  </Text>
                </div>

                {/* Stop Share Button for Presenter */}
                {isHostSharer && (
                  <Button
                    color="red"
                    size="xs"
                    onClick={this.stopPublishingLocalStream}
                    leftSection={<IconScreenShareOff size={16} />}
                    style={{
                      position: "absolute",
                      top: "12px",
                      right: "12px",
                      zIndex: 2,
                    }}
                  >
                    Stop Sharing
                  </Button>
                )}

                {/* Hardware Accelerated Video Stream */}
                <video
                  id="leftVideo"
                  autoPlay
                  playsInline
                  controls
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    maxHeight: "calc(100vh - 90px)",
                  }}
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
            style={{
              width: this.state.showChatColumn ? "360px" : "0px",
              minWidth: this.state.showChatColumn ? "360px" : "0px",
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#0d0e12",
              borderLeft: "1px solid rgba(255, 46, 76, 0.15)",
              transition: "width 0.3s ease",
              overflow: "hidden",
              padding: this.state.showChatColumn ? "10px" : "0px",
              gap: "10px",
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

            {/* Real-time Text Chat */}
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
          </aside>
        </div>
      </div>
    );
  }
}
