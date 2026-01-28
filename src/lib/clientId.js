const CLIENT_ID_KEY = "client_id";

export function getClientId() {
  if (typeof window === "undefined") return "server";
  let clientId = window.localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function peekClientId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CLIENT_ID_KEY);
}
