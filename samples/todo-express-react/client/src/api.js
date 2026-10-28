// Every call to the server goes through here, so the token is added in one place.
async function request(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  signup: (email, password) => request("/auth/signup", { method: "POST", body: { email, password } }),
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  listTodos: () => request("/todos"),
  addTodo: (title) => request("/todos", { method: "POST", body: { title } }),
  toggleTodo: (id, done) => request(`/todos/${id}`, { method: "PATCH", body: { done } }),
  deleteTodo: (id) => request(`/todos/${id}`, { method: "DELETE" }),
};
