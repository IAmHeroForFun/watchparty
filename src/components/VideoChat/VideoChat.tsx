import React from "react";
import { ActionIcon, Button, Text } from "@mantine/core";
import { Socket } from "socket.io-client";

import {
  getOrCreateClientId,
  getColorForStringHex,
  getDefaultPicture,
  iceServers,
} from "../../utils/utils";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneCall,
  IconPhoneOff,
} from "@tabler/icons-react";

interface VideoChatProps {
  socket: Socket;
  participants: User[];
  pictureMap: StringDict;
  nameMap: StringDict;
  tsMap: NumberDict;
  rosterUpdateTS: Number;
  hide?: boolean;
  owner: string | undefined;
  getLeaderTime: () => number;
}

export class VideoChat extends React.Component<VideoChatProps> {
  socket = this.props.socket;

  componentDidMount() {
    if (this.socket) {
      this.socket.on("signal", this.handleSignal);
    }
  }

  componentWillUnmount() {
    if (this.socket) {
      this.socket.off("signal", this.handleSignal);
    }
  }

  componentDidUpdate(prevProps: VideoChatProps) {
    if (this.props.socket !== prevProps.socket) {
      if (this.socket) {
        this.socket.off("signal", this.handleSignal);
      }
      this.socket = this.props.socket;
      if (this.socket) {
        this.socket.on("signal", this.handleSignal);
      }
    }
    if (this.props.rosterUpdateTS !== prevProps.rosterUpdateTS) {
      this.updateWebRTC();
    }
  }

  emitUserMute = () => {
    if (this.socket) {
      this.socket.emit("CMD:userMute", { isMuted: !this.getAudioWebRTC() });
    }
  };

  handleSignal = async (data: any) => {
    const msg = data.msg;
    const from = data.from;
    let pc = window.watchparty.videoPCs[from];
    if (!pc) {
      return;
    }
    if (msg.ice !== undefined) {
      pc.addIceCandidate(new RTCIceCandidate(msg.ice));
    } else if (msg.sdp && msg.sdp.type === "offer") {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        pc.close();
        delete window.watchparty.videoPCs[from];
        this.updateWebRTC();
        pc = window.watchparty.videoPCs[from];
        if (!pc) {
          return;
        }
      }
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal(from, { sdp: pc.localDescription });
    } else if (msg.sdp && msg.sdp.type === "answer") {
      pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    }
  };

  setupWebRTC = async () => {
    try {
      const stream = await navigator?.mediaDevices?.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      window.watchparty.ourStream = stream;
      this.socket.emit("CMD:joinVideo");
      this.emitUserMute();
      this.forceUpdate();
    } catch (e) {
      console.warn("Microphone access failed:", e);
    }
  };

  stopWebRTC = () => {
    const ourStream = window.watchparty.ourStream;
    const videoPCs = window.watchparty.videoPCs;
    if (ourStream) {
      ourStream.getTracks().forEach((track) => track.stop());
    }
    window.watchparty.ourStream = undefined;
    Object.keys(videoPCs).forEach((key) => {
      videoPCs[key].close();
      delete videoPCs[key];
    });
    this.socket.emit("CMD:leaveVideo");
    this.forceUpdate();
  };

  toggleAudioWebRTC = () => {
    const ourStream = window.watchparty.ourStream;
    if (ourStream && ourStream.getAudioTracks()[0]) {
      ourStream.getAudioTracks()[0].enabled =
        !ourStream.getAudioTracks()[0].enabled;
    }
    this.emitUserMute();
    this.forceUpdate();
  };

  getAudioWebRTC = () => {
    const ourStream = window.watchparty.ourStream;
    return Boolean(
      ourStream &&
        ourStream.getAudioTracks()[0] &&
        ourStream.getAudioTracks()[0].enabled,
    );
  };

  updateWebRTC = () => {
    const ourStream = window.watchparty.ourStream;
    const videoPCs = window.watchparty.videoPCs;
    const videoRefs = window.watchparty.videoRefs;
    if (!ourStream) {
      return;
    }
    const selfId = getOrCreateClientId();

    const clientIds = new Set(
      this.props.participants.filter((p) => p.isVideoChat).map((p) => p.id),
    );
    Object.entries(videoPCs).forEach(([key, value]) => {
      if (!clientIds.has(key)) {
        value.close();
        delete videoPCs[key];
      }
    });

    this.props.participants.forEach((user) => {
      const id = user.id;
      if (!user.isVideoChat || videoPCs[id]) {
        return;
      }
      if (id === selfId) {
        videoPCs[id] = new RTCPeerConnection();
        if (videoRefs[id]) {
          videoRefs[id].srcObject = ourStream;
        }
      } else {
        const pc = new RTCPeerConnection({ iceServers: iceServers() });
        videoPCs[id] = pc;
        ourStream?.getTracks().forEach((track) => {
          pc.addTrack(track, ourStream);
        });
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this.sendSignal(id, { ice: event.candidate });
          }
        };
        pc.ontrack = (event: RTCTrackEvent) => {
          if (videoRefs[id]) {
            videoRefs[id].srcObject = event.streams[0];
          }
        };
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === "failed") {
            pc.close();
            delete videoPCs[id];
            this.updateWebRTC();
          }
        };
        const isOfferer = selfId < id;
        if (isOfferer) {
          pc.onnegotiationneeded = async () => {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignal(id, { sdp: pc.localDescription });
          };
        }
      }
    });
  };

  sendSignal = async (to: string, data: any) => {
    this.socket.emit("signal", { to, msg: data });
  };

  render() {
    const { participants, pictureMap, nameMap } = this.props;
    const ourStream = window.watchparty.ourStream;
    const videoRefs = window.watchparty.videoRefs;
    const selfId = getOrCreateClientId();

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          padding: "8px",
          background: "#0d0e12",
          borderRadius: "6px",
          border: "1px solid rgba(255, 46, 76, 0.15)",
        }}
      >
        {/* Voice Chat Control Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: "6px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <Text size="xs" fw={700} c="dimmed" style={{ letterSpacing: "1px" }}>
            VOICE CHAT
          </Text>
          <div style={{ display: "flex", gap: "6px" }}>
            {!ourStream ? (
              <Button
                size="compact-xs"
                color="red"
                onClick={this.setupWebRTC}
                leftSection={<IconPhoneCall size={14} />}
              >
                Join Voice
              </Button>
            ) : (
              <>
                <ActionIcon
                  size="sm"
                  color={this.getAudioWebRTC() ? "green" : "red"}
                  variant="filled"
                  onClick={this.toggleAudioWebRTC}
                  title={this.getAudioWebRTC() ? "Mute Mic" : "Unmute Mic"}
                >
                  {this.getAudioWebRTC() ? (
                    <IconMicrophone size={14} />
                  ) : (
                    <IconMicrophoneOff size={14} />
                  )}
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  onClick={this.stopWebRTC}
                  title="Leave Voice"
                >
                  <IconPhoneOff size={14} />
                </ActionIcon>
              </>
            )}
          </div>
        </div>

        {/* Participant List */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            maxHeight: "180px",
            overflowY: "auto",
          }}
        >
          {participants.map((p) => {
            const isSelf = p.id === selfId;
            const inVoice = Boolean(p.isVideoChat);
            const isMuted = isSelf ? !this.getAudioWebRTC() : Boolean(p.isMuted);
            const displayName = nameMap[p.id] || p.id;
            const avatarUrl =
              pictureMap[p.id] ||
              getDefaultPicture(displayName, getColorForStringHex(p.id));

            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  background: inVoice ? "rgba(255, 46, 76, 0.08)" : "#131418",
                  border: inVoice && !isMuted
                    ? "1px solid rgba(255, 46, 76, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.04)",
                  boxShadow: inVoice && !isMuted
                    ? "0 0 8px rgba(255, 46, 76, 0.2)"
                    : "none",
                }}
              >
                {/* Hidden audio element for receiving peer audio */}
                {inVoice && (
                  <audio
                    ref={(el) => {
                      if (el) {
                        videoRefs[p.id] = el as any;
                      }
                    }}
                    autoPlay
                    playsInline
                    muted={isSelf}
                    style={{ display: "none" }}
                  />
                )}

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      border: inVoice && !isMuted
                        ? "2px solid #ff2e4c"
                        : "2px solid transparent",
                    }}
                  />
                  <Text
                    size="sm"
                    fw={500}
                    style={{
                      color: isSelf ? "#ff4d5e" : "#f1f5f9",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "140px",
                    }}
                  >
                    {displayName} {isSelf && "(You)"}
                  </Text>
                </div>

                <div>
                  {inVoice ? (
                    isMuted ? (
                      <IconMicrophoneOff size={16} color="#e03131" />
                    ) : (
                      <IconMicrophone size={16} color="#ff2e4c" />
                    )
                  ) : (
                    <Text size="xs" c="dimmed">
                      Listening
                    </Text>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
