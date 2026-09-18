import { Server, Socket } from "socket.io";

declare module "socket.io" {
  interface Socket {
    clientId: string;
  }
}

export class Room {
  public video: string | null = "";
  public videoTS = 0;
  public subtitle = "";
  public playbackRate = 1;
  public paused = false;
  public loop = false;
  private chat: ChatMessage[] = [];
  private nameMap: StringDict = {};
  private pictureMap: StringDict = {};

  public roomId: string;
  public roster: User[] = [];
  private io: Server;
  private socketIdMap: StringDict = {};
  public isChatDisabled = false;
  public lastUpdateTime: Date = new Date();

  constructor(io: Server, roomId: string) {
    this.roomId = roomId;
    this.io = io;

    io.of(roomId).use((socket, next) => {
      const clientId = socket.handshake.query?.clientId;
      if (typeof clientId !== "string" || !clientId) {
        next(new Error("Invalid clientId"));
        return;
      }

      // Disconnect any existing socket with this clientId
      if (this.socketIdMap[clientId]) {
        io.of(roomId).sockets.get(this.socketIdMap[clientId])?.disconnect();
      }

      this.socketIdMap[clientId] = socket.id;
      if (!this.roster.find((user) => user.id === clientId)) {
        this.roster.push({ id: clientId });
      }

      next();
    });

    io.of(roomId).on("connection", (socket: Socket) => {
      const clientId = socket.handshake.query?.clientId as string;
      socket.clientId = clientId;

      // Send initial room state
      socket.emit("REC:host", this.getHostState());
      socket.emit("REC:nameMap", this.nameMap);
      socket.emit("REC:pictureMap", this.pictureMap);
      socket.emit("REC:lock", "");
      socket.emit("chatinit", this.chat);
      socket.emit("REC:getRoomState", { isChatDisabled: false });
      io.of(roomId).emit("roster", this.getRosterForApp());

      // Profile & Identity
      socket.on("CMD:name", (data: unknown) =>
        this.changeUserName(socket, String(data)),
      );
      socket.on("CMD:picture", (data: unknown) =>
        this.changeUserPicture(socket, String(data)),
      );

      // Chat
      socket.on("CMD:chat", (data: unknown) =>
        this.sendChatMessage(socket, String(data)),
      );
      socket.on("CMD:chatV2", (data: unknown) =>
        this.sendChatMessage(socket, data),
      );
      socket.on("CMD:addReaction", (data: unknown) =>
        this.addReaction(socket, data),
      );
      socket.on("CMD:removeReaction", (data: unknown) =>
        this.removeReaction(socket, data),
      );
      socket.on("CMD:deleteChatMessages", (data: unknown) =>
        this.deleteChatMessages(data),
      );

      // Voice Chat
      socket.on("CMD:joinVideo", () => this.joinVideo(socket));
      socket.on("CMD:leaveVideo", () => this.leaveVideo(socket));
      socket.on("CMD:userMute", (data: unknown) =>
        this.setUserMute(socket, data),
      );

      // Screen Share
      socket.on("CMD:joinScreenShare", () => this.joinScreenSharing(socket));
      socket.on("CMD:leaveScreenShare", () => this.leaveScreenSharing(socket));

      // Queries
      socket.on("CMD:askHost", () =>
        socket.emit("REC:host", this.getHostState()),
      );
      socket.on("CMD:getRoomState", () =>
        socket.emit("REC:getRoomState", { isChatDisabled: false }),
      );
      socket.on("CMD:kickUser", (data: unknown) => this.kickUser(data));

      // WebRTC Signaling
      socket.on("signal", (data: unknown) =>
        this.sendSignal(socket, data, "signal"),
      );
      socket.on("signalSS", (data: unknown) =>
        this.sendSignal(socket, data, "signalSS"),
      );

      socket.on("disconnect", () => this.onDisconnect(socket));
    });
  }

  public destroy = () => {
    this.roster = [];
    this.socketIdMap = {};
  };

  protected getSharerId = (): string => {
    if (this.video?.startsWith("screenshare://")) {
      return this.video.slice("screenshare://".length).split("@")[0];
    }
    return "";
  };

  protected getRosterForApp = (): User[] => {
    const sharerId = this.getSharerId();
    return this.roster.map((p) => ({
      ...p,
      isScreenShare: p.id === sharerId,
    }));
  };

  private getHostState = (): HostState => {
    return {
      video: this.video ?? "",
      videoTS: this.videoTS,
      subtitle: this.subtitle,
      playbackRate: this.playbackRate,
      paused: this.paused,
      isVBrowserLarge: false,
      loop: this.loop,
    };
  };

  public addChatMessage = (
    socket: Socket | null,
    chatMsg: ChatMessageBase,
  ) => {
    if (this.isChatDisabled && !chatMsg.cmd) {
      return;
    }
    const chatWithTime: ChatMessage = {
      ...chatMsg,
      timestamp: new Date().toISOString(),
    };
    this.chat.push(chatWithTime);
    if (this.chat.length > 100) {
      this.chat = this.chat.slice(-100);
    }
    this.lastUpdateTime = new Date();
    this.io.of(this.roomId).emit("REC:chat", chatWithTime);
  };

  private changeUserName = (socket: Socket, data: string) => {
    if (!data || data.length > 50) {
      return;
    }
    this.nameMap[socket.clientId] = data;
    this.lastUpdateTime = new Date();
    this.io.of(this.roomId).emit("REC:nameMap", this.nameMap);
  };

  private changeUserPicture = (socket: Socket, data: string) => {
    if (!data || data.length > 10000) {
      return;
    }
    this.pictureMap[socket.clientId] = data;
    this.lastUpdateTime = new Date();
    this.io.of(this.roomId).emit("REC:pictureMap", this.pictureMap);
  };

  private isValidChatMessage = (msg: string | undefined) => {
    return Boolean(msg && msg.length <= 10000);
  };

  private sendChatMessage = (socket: Socket, raw: unknown) => {
    const payload = typeof raw === "string" ? { msg: raw } : raw;
    if (!payload || typeof payload !== "object") {
      return;
    }

    const data = payload as Record<string, unknown>;
    const msg = typeof data.msg === "string" ? data.msg : undefined;
    const replyToId =
      typeof data.replyToId === "string" ? data.replyToId : undefined;
    const replyToTimestamp =
      typeof data.replyToTimestamp === "string"
        ? data.replyToTimestamp
        : undefined;

    if (!msg || !this.isValidChatMessage(msg)) {
      return;
    }

    if (Boolean(replyToId) !== Boolean(replyToTimestamp)) {
      return;
    }

    const baseMsg: ChatMessageBase = { id: socket.clientId, msg };

    if (!replyToId || !replyToTimestamp) {
      this.addChatMessage(socket, baseMsg);
      return;
    }

    const target = this.chat.find(
      (m) => m.id === replyToId && m.timestamp === replyToTimestamp,
    );
    if (!target) {
      this.addChatMessage(socket, baseMsg);
      return;
    }

    this.addChatMessage(socket, {
      ...baseMsg,
      replyToId,
      replyToTimestamp,
      replyToUserId: replyToId,
      replyToMsg: target.msg || "",
    });
  };

  private addReaction = (socket: Socket, raw: unknown) => {
    const data = raw as { value: string; msgId: string; msgTimestamp: string };
    if (!data || !data.value || !data.msgId || !data.msgTimestamp) {
      return;
    }
    if (data.value.length > 8) {
      return;
    }
    const msg = this.chat.find(
      (m) => m.id === data.msgId && m.timestamp === data.msgTimestamp,
    );
    if (!msg) {
      return;
    }
    msg.reactions = msg.reactions || {};
    msg.reactions[data.value] = msg.reactions[data.value] || [];

    if (!msg.reactions[data.value].includes(socket.clientId)) {
      msg.reactions[data.value].push(socket.clientId);
      const reaction: Reaction = { user: socket.clientId, ...data };
      this.io.of(this.roomId).emit("REC:addReaction", reaction);
    }
  };

  private removeReaction = (socket: Socket, raw: unknown) => {
    const data = raw as { value: string; msgId: string; msgTimestamp: string };
    if (!data || !data.value || !data.msgId || !data.msgTimestamp) {
      return;
    }
    if (data.value.length > 8) {
      return;
    }
    const msg = this.chat.find(
      (m) => m.id === data.msgId && m.timestamp === data.msgTimestamp,
    );
    if (!msg || !msg.reactions?.[data.value]) {
      return;
    }
    msg.reactions[data.value] = msg.reactions[data.value].filter(
      (id) => id !== socket.clientId,
    );
    const reaction: Reaction = { user: socket.clientId, ...data };
    this.io.of(this.roomId).emit("REC:removeReaction", reaction);
  };

  private joinVideo = (socket: Socket) => {
    const match = this.roster.find((user) => user.id === socket.clientId);
    if (match) {
      match.isVideoChat = true;
    }
    this.lastUpdateTime = new Date();
    this.io.of(this.roomId).emit("roster", this.getRosterForApp());
  };

  private leaveVideo = (socket: Socket) => {
    const match = this.roster.find((user) => user.id === socket.clientId);
    if (match) {
      match.isVideoChat = false;
    }
    this.lastUpdateTime = new Date();
    this.io.of(this.roomId).emit("roster", this.getRosterForApp());
  };

  private setUserMute = (socket: Socket, raw: unknown) => {
    const data = raw as { isMuted: boolean };
    if (!data) {
      return;
    }
    const match = this.roster.find((user) => user.id === socket.clientId);
    if (match) {
      match.isMuted = data.isMuted;
    }
    this.io.of(this.roomId).emit("roster", this.getRosterForApp());
  };

  private joinScreenSharing = (socket: Socket) => {
    const currentSharer = this.getRosterForApp().find(
      (user) => user.isScreenShare,
    );
    if (currentSharer) {
      socket.emit(
        "errorMessage",
        "There is already an active share in this room",
      );
      return;
    }
    this.video = "screenshare://" + socket.clientId;
    this.lastUpdateTime = new Date();
    this.io.of(this.roomId).emit("REC:host", this.getHostState());
    this.io.of(this.roomId).emit("roster", this.getRosterForApp());
  };

  private leaveScreenSharing = (socket: Socket) => {
    const sharerId = this.getSharerId();
    if (!sharerId || sharerId !== socket.clientId) {
      return;
    }
    this.video = "";
    this.lastUpdateTime = new Date();
    this.io.of(this.roomId).emit("REC:host", this.getHostState());
    this.io.of(this.roomId).emit("roster", this.getRosterForApp());
  };

  private sendSignal = (
    socket: Socket,
    raw: unknown,
    eventName: "signal" | "signalSS",
  ) => {
    const data = raw as { to: string; msg: string; sharer?: boolean };
    if (!data || !data.to) {
      return;
    }
    const fromClientId = socket.clientId;
    const toId = this.socketIdMap[data.to];
    if (toId) {
      this.io.of(this.roomId).to(toId).emit(eventName, {
        from: fromClientId,
        msg: data.msg,
        sharer: data.sharer,
      });
    }
  };

  private onDisconnect = (socket: Socket) => {
    const { clientId } = socket;
    if (socket.id === this.socketIdMap[clientId]) {
      const index = this.roster.findIndex((user) => user.id === clientId);
      if (index > -1) {
        this.roster.splice(index, 1);
      }
      delete this.socketIdMap[clientId];

      // If this user was the active screen sharer, reset room media
      if (this.getSharerId() === clientId) {
        this.video = "";
        this.io.of(this.roomId).emit("REC:host", this.getHostState());
      }

      this.lastUpdateTime = new Date();
      this.io.of(this.roomId).emit("roster", this.getRosterForApp());
    }
  };

  private kickUser = (raw: unknown) => {
    const data = raw as { userToBeKicked: string };
    if (!data?.userToBeKicked) {
      return;
    }
    const targetSocketId = this.socketIdMap[data.userToBeKicked];
    if (targetSocketId) {
      const targetSocket = this.io
        .of(this.roomId)
        .sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit("kicked");
        targetSocket.disconnect();
      }
    }
  };

  private deleteChatMessages = (raw: unknown) => {
    const data = raw as {
      author?: string;
      timestamp?: string;
    };
    if (!data || (!data.timestamp && !data.author)) {
      this.chat.length = 0;
    } else {
      this.chat = this.chat.filter((msg) => {
        if (data.timestamp) {
          return msg.id !== data.author || msg.timestamp !== data.timestamp;
        }
        return msg.id !== data.author;
      });
    }
    this.io.of(this.roomId).emit("chatinit", this.chat);
  };
}
