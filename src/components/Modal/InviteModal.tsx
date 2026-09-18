import React, { useState } from "react";
import { Modal, TextInput, ActionIcon, Text, Stack } from "@mantine/core";
import { IconCopy, IconCheck } from "@tabler/icons-react";

export const InviteModal = ({
  closeInviteModal,
}: {
  closeInviteModal: () => void;
}) => {
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setInviteLinkCopied(true);
    setTimeout(() => setInviteLinkCopied(false), 3000);
  };

  return (
    <Modal
      opened
      centered
      onClose={closeInviteModal}
      title="INVITE USERS"
      styles={{
        content: {
          backgroundColor: "#0d0d12",
          border: "1px solid #2a2a35",
          color: "#eee",
          fontFamily: "'Fira Code', monospace",
        },
        header: {
          backgroundColor: "#0d0d12",
          color: "#ff2e4c",
          fontWeight: 700,
          letterSpacing: "0.05em",
        },
      }}
    >
      <Stack gap="md">
        <Text size="xs" c="dimmed">
          Share this direct room link. Anyone with this URL can join your live screen share and voice session.
        </Text>
        <TextInput
          readOnly
          defaultValue={window.location.href}
          styles={{
            input: {
              backgroundColor: "#16161f",
              borderColor: "#2a2a35",
              color: "#ff2e4c",
              fontFamily: "'Fira Code', monospace",
              fontSize: "0.85rem",
            },
          }}
          rightSection={
            <ActionIcon
              onClick={handleCopyInviteLink}
              color="red"
              variant="filled"
            >
              {inviteLinkCopied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          }
        />
        {inviteLinkCopied && (
          <Text size="xs" c="#00e676" fw={700}>
            ✓ Room link copied to clipboard.
          </Text>
        )}
      </Stack>
    </Modal>
  );
};
