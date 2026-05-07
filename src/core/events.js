const EVENT_TYPES = {
  USER_MESSAGE: "user_message",
  ASSISTANT_MESSAGE: "assistant_message",
  MODEL_USAGE: "model_usage",
  TOOL_CALL: "tool_call",
  AGENT_CALL: "agent_call",
  SESSION_ACTIVITY: "session_activity",
};

function cleanIdPart(value) {
  return String(value || "unknown").replace(/\s+/g, "-");
}

function createEvent({
  source,
  type,
  timestamp,
  projectId,
  sessionId,
  messageId,
  index = 0,
  payload = {},
}) {
  return {
    id: [
      cleanIdPart(source),
      cleanIdPart(type),
      cleanIdPart(projectId),
      cleanIdPart(sessionId),
      cleanIdPart(messageId),
      cleanIdPart(index),
    ].join(":"),
    source,
    type,
    timestamp,
    projectId,
    sessionId,
    messageId,
    payload,
  };
}

module.exports = { EVENT_TYPES, createEvent };
