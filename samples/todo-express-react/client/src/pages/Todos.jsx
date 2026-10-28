import { useEffect, useState } from "react";
import { api } from "../api";

export default function Todos({ onLogout }) {
  const [todos, setTodos] = useState([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listTodos().then((list) => {
      setTodos(list);
      setLoading(false);
    });
  }, []);

  async function add(event) {
    event.preventDefault();
    const todo = await api.addTodo(title);
    setTodos([...todos, todo]);
    setTitle("");
  }

  async function toggle(todo) {
    await api.toggleTodo(todo.id, !todo.done);
    setTodos(todos.map((t) => (t.id === todo.id ? { ...t, done: !t.done } : t)));
  }

  async function remove(id) {
    await api.deleteTodo(id);
    setTodos(todos.filter((t) => t.id !== id));
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <button onClick={onLogout}>Log out</button>
      <form onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New todo" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <input type="checkbox" checked={!!todo.done} onChange={() => toggle(todo)} />
            <span dangerouslySetInnerHTML={{ __html: todo.title }} />
            <button onClick={() => remove(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
