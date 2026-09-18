import React from "react";
import { Text } from "@mantine/core";

export const Footer = () => (
  <footer
    style={{
      padding: "20px",
      textAlign: "center",
      borderTop: "1px solid rgba(255, 46, 76, 0.15)",
      backgroundColor: "#0a0a0d",
    }}
  >
    <Text size="xs" c="dimmed">
      StreamParty • Self-Hosted Private Screen & Voice Stream
    </Text>
  </footer>
);
