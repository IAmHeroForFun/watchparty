import React, { useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { InviteModal } from "../Modal/InviteModal";
import { IconUserPlus } from "@tabler/icons-react";

export const InviteButton = () => {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  return (
    <>
      {inviteModalOpen && (
        <InviteModal closeInviteModal={() => setInviteModalOpen(false)} />
      )}
      <Tooltip label="Invite Friends" withArrow>
        <ActionIcon
          size="34px"
          variant="light"
          color="red"
          style={{
            border: "1px solid rgba(255, 46, 76, 0.4)",
            backgroundColor: "rgba(255, 46, 76, 0.1)",
          }}
          onClick={() => setInviteModalOpen(true)}
        >
          <IconUserPlus size={18} color="#ff2e4c" />
        </ActionIcon>
      </Tooltip>
    </>
  );
};
