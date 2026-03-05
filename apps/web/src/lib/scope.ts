const SELECTED_CLIENT_KEY = "dcms_selected_client_id";

export function getSelectedClientId() {
  return localStorage.getItem(SELECTED_CLIENT_KEY);
}

export function setSelectedClientId(clientId: string | null) {
  if (!clientId) {
    localStorage.removeItem(SELECTED_CLIENT_KEY);
    return;
  }
  localStorage.setItem(SELECTED_CLIENT_KEY, clientId);
}

