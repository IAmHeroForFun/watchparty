import React from "react";
import { Button, Text } from "@mantine/core";
import {
  IconScreenShare,
  IconMicrophone,
  IconMessageFilled,
  IconLock,
  type IconProps,
} from "@tabler/icons-react";
import { NewRoomButton } from "../TopBar/TopBar";
import styles from "./Home.module.css";

export const Home = () => {
  return (
    <div style={{ backgroundColor: "#08080a", minHeight: "calc(100vh - 120px)", color: "#f1f5f9" }}>
      <div className={styles.container}>
        {/* Main Hero */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "80px 20px 60px",
            maxWidth: "800px",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "2px",
              textTransform: "uppercase",
              color: "#ff2e4c",
              marginBottom: "12px",
            }}
          >
            Private • Real-Time • WebRTC
          </div>
          <h1
            style={{
              fontSize: "48px",
              fontWeight: 800,
              lineHeight: 1.15,
              color: "#ffffff",
              marginBottom: "20px",
            }}
          >
            Stream Your Screen & Talk in Real Time.
          </h1>
          <Text
            size="lg"
            c="dimmed"
            style={{ maxWidth: "600px", marginBottom: "36px", lineHeight: 1.6 }}
          >
            Ultra-low latency screen sharing with full computer audio, multi-party voice chat, and live text. No accounts, no downloads, completely invite-only.
          </Text>

          <div style={{ width: "260px" }}>
            <NewRoomButton size="lg" />
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px",
            maxWidth: "1000px",
            margin: "0 auto 80px",
            padding: "0 20px",
          }}
        >
          <FeatureCard
            Icon={IconScreenShare}
            title="Screen & Tab Audio"
            description="Share your entire monitor, window, or specific browser tab with crisp audio capture in sub-second WebRTC latency."
          />
          <FeatureCard
            Icon={IconMicrophone}
            title="Crystal-Clear Voice"
            description="Multi-party voice communication powered by the Opus audio codec. Mute and unmute instantly with speaking indicators."
          />
          <FeatureCard
            Icon={IconMessageFilled}
            title="Live Text Chat"
            description="Drop links, react with emojis, and chat with friends right beside the live stream without interrupting conversation."
          />
          <FeatureCard
            Icon={IconLock}
            title="Private & Invite-Only"
            description="Zero public directories or tracking. Rooms are unlisted — only friends you send the link to can enter."
          />
        </div>
      </div>
    </div>
  );
};

const FeatureCard = (props: {
  Icon: React.ComponentType<IconProps>;
  title: string;
  description: string;
}) => {
  const { Icon, title, description } = props;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#121318",
        border: "1px solid rgba(255, 46, 76, 0.2)",
        borderRadius: "8px",
        padding: "24px",
        transition: "transform 0.2s ease, border-color 0.2s ease",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "6px",
          backgroundColor: "rgba(255, 46, 76, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px",
        }}
      >
        <Icon size={26} color="#ff2e4c" />
      </div>
      <Text size="lg" fw={700} style={{ color: "#f8fafc", marginBottom: "8px" }}>
        {title}
      </Text>
      <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
        {description}
      </Text>
    </div>
  );
};
