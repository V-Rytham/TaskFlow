import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { io } from "socket.io-client";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  Folder,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Users,
  X,
  Zap,
} from "lucide-react";
import { api, type Project, type Status, type Task, type User } from "./api";

const labels: Record<Status, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};
const initials = (name: string) =>
  name
    .split(" ")
    .map((v) => v[0])
    .slice(0, 2)
    .join("");
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => {
      dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function App() {
  const client = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ user: User }>("/auth/me"),
  });
  const [connection, setConnection] = useState("Connecting");
  useEffect(() => {
    const expire = () => {
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "me",
      });
      client.setQueryData(["me"], null);
    };
    window.addEventListener("taskflow:unauthorized", expire);
    return () => window.removeEventListener("taskflow:unauthorized", expire);
  }, [client]);
  useEffect(() => {
    if (!me.data) return;
    const socket = io({ withCredentials: true });
    const invalidate = () => {
      void client.invalidateQueries({ queryKey: ["tasks"] });
      void client.invalidateQueries({ queryKey: ["projects"] });
      void client.invalidateQueries({ queryKey: ["people"] });
    };
    socket.on("connect", () => {
      setConnection("Live");
      invalidate();
    });
    socket.on("disconnect", (reason) => {
      setConnection("Disconnected");
      if (reason === "io server disconnect")
        void client.invalidateQueries({ queryKey: ["me"] });
    });
    socket.io.on("reconnect_attempt", () => setConnection("Reconnecting"));
    socket.on("connect_error", (error) => {
      setConnection("Reconnecting");
      if (error.message === "Unauthorized")
        void client.invalidateQueries({ queryKey: ["me"] });
    });
    for (const event of [
      "task:created",
      "task:updated",
      "task:deleted",
      "task:completed",
      "availability:changed",
      "project:changed",
    ])
      socket.on(event, invalidate);
    return () => {
      socket.disconnect();
    };
  }, [me.data, client]);
  if (me.isPending)
    return (
      <div className="full-loading">
        <Zap /> Opening your workspace…
      </div>
    );
  return (
    <Routes>
      <Route
        path="/login"
        element={
          me.data ? <Navigate to="/" replace /> : <Auth register={false} />
        }
      />
      <Route
        path="/register"
        element={me.data ? <Navigate to="/" replace /> : <Auth register />}
      />
      <Route
        path="/*"
        element={
          me.data ? (
            <Workspace user={me.data.user} connection={connection} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
function Auth({ register }: { register: boolean }) {
  const client = useQueryClient();
  const [role, setRole] = useState<User["role"]>("PROJECT_HEAD");
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      api<{ user: User }>(
        register ? "/auth/register" : "/auth/login",
        "POST",
        data,
      ),
    onSuccess: (data) => {
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "me",
      });
      client.setQueryData(["me"], data);
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    mutation.mutate(register ? { ...data, role } : data);
  }
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Link className="brand" to="/">
          <span className="brand-icon">
            <Zap size={22} fill="currentColor" />
          </span>
          taskflow<span className="brand-dot">.</span>
        </Link>
        <div>
          <div className="eyebrow">LESS FRICTION. MORE MOMENTUM.</div>
          <h1>
            Great work
            <br />
            starts with
            <br />
            <span>a little clarity.</span>
          </h1>
          <p>
            Bring your projects, people, and progress together.
            <br />
            One focused workspace. A shared way forward.
          </p>
          <div className="story-card">
            <div className="story-check">
              <Check size={18} />
            </div>
            <div>
              <strong>Make room for what matters</strong>
              <p>One active task. Your full attention.</p>
            </div>
            <ArrowDownRight size={24} />
          </div>
        </div>
        <small>Thoughtfully simple. Effortlessly in sync.</small>
      </aside>
      <main className="auth-main">
        <div className="auth-form">
          <span className="pill">YOUR WORK, IN FLOW</span>
          <h2>{register ? "Find your flow." : "Welcome back."}</h2>
          <p>
            {register
              ? "Create your account and make great things happen."
              : "Sign in to pick up where you left off."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Alex Morgan"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder={
                  register ? "At least 10 characters" : "Enter your password"
                }
              />
            </label>
            {register && (
              <fieldset>
                <legend>How will you use TaskFlow?</legend>
                <div className="role-options">
                  {(["PROJECT_HEAD", "ASSIGNEE"] as const).map((value) => (
                    <button
                      type="button"
                      aria-pressed={role === value}
                      key={value}
                      className={role === value ? "selected" : ""}
                      onClick={() => setRole(value)}
                    >
                      {value === "PROJECT_HEAD" ? (
                        <Folder size={18} />
                      ) : (
                        <Users size={18} />
                      )}
                      <strong>
                        {value === "PROJECT_HEAD" ? "Project Head" : "Assignee"}
                      </strong>
                      <small>
                        {value === "PROJECT_HEAD"
                          ? "Lead projects & assign work"
                          : "Focus on your assigned tasks"}
                      </small>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {mutation.error && (
              <p role="alert" className="error">
                {mutation.error.message}
              </p>
            )}
            <button className="primary wide" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Please wait…"
                : register
                  ? "Create account"
                  : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to TaskFlow?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
          {!register && import.meta.env.DEV && (
            <div className="demo-note">
              <strong>Explore the demo</strong>
              <p>
                Head: alex@taskflow.local
                <br />
                Assignee: casey@taskflow.local
                <br />
                Password: TaskflowDemo!2026
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
function Workspace({ user, connection }: { user: User; connection: string }) {
  const head = user.role === "PROJECT_HEAD";
  const client = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
  });
  const [modal, setModal] = useState<"project" | "people" | null>(null);
  const [notice, setNotice] = useState("");
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function logout() {
    try {
      await api("/auth/logout", "POST");
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "me",
      });
      client.setQueryData(["me"], null);
      navigate("/login");
    } catch (error) {
      setLogoutError((error as Error).message);
    }
  }
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-icon">
            <Zap size={21} fill="currentColor" />
          </span>
          taskflow<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">
          WORKSPACE<span className="workspace-badge">TF</span>
        </div>
        <Link className="nav-main" to="/">
          <LayoutDashboard size={18} />
          {head ? "Overview" : "My tasks"}
        </Link>
        {head && (
          <button className="nav-item" onClick={() => setModal("people")}>
            <Users size={18} />
            Available people
          </button>
        )}
        <div className="sidebar-heading">
          PROJECTS
          {head && (
            <button
              aria-label="Create project"
              onClick={() => setModal("project")}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        <nav>
          {projects.data?.map((p, index) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="project-nav">
              <span className={`project-dot color-${index % 3}`} />
              {p.name}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="focus-note">
            <span>✦</span>
            <strong>A little focus goes a long way.</strong>
            <p>
              One task at a time.
              <br />
              One step closer.
            </p>
          </div>
          <div className="user-row">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{head ? "Project Head" : "Assignee"}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Log out"
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
          {logoutError && <small className="error">{logoutError}</small>}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Your workspace <ChevronRight size={14} />{" "}
            {head ? "Projects" : "My tasks"}
          </span>
          <div className={`connection ${connection === "Live" ? "live" : ""}`}>
            <i />
            {connection === "Live" ? "All changes synced" : connection}
          </div>
        </header>
        <Routes>
          <Route
            path="/"
            element={
              head ? (
                <Overview
                  user={user}
                  projects={projects.data ?? []}
                  loading={projects.isPending}
                  error={projects.error?.message}
                  create={() => setModal("project")}
                  people={() => setModal("people")}
                />
              ) : (
                <TaskView user={user} notify={setNotice} />
              )
            }
          />
          <Route
            path="/projects/:id"
            element={<TaskView user={user} notify={setNotice} />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <footer className="footer">
          <span>Built for focus. Designed for progress.</span>
          <span>TaskFlow workspace</span>
        </footer>
      </main>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {modal === "project" && (
        <Modal title="Create a project" close={() => setModal(null)}>
          <ProjectForm
            done={() => {
              setModal(null);
              setNotice("Your project is ready.");
            }}
          />
        </Modal>
      )}
      {modal === "people" && (
        <Modal title="Available people" close={() => setModal(null)}>
          <People />
        </Modal>
      )}
    </div>
  );
}
function Overview({
  user,
  projects,
  loading,
  error,
  create,
  people,
}: {
  user: User;
  projects: Project[];
  loading: boolean;
  error?: string;
  create: () => void;
  people: () => void;
}) {
  const tasks = projects.flatMap((p) => p.tasks);
  const done = tasks.filter((t) => t.status === "DONE").length;
  const [search, setSearch] = useState("");
  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">LET’S MAKE THINGS HAPPEN</div>
          <h1>
            Hello, {user.name.split(" ")[0]}
            <span className="wave">✦</span>
          </h1>
          <p>Here’s the big picture. Keep your team moving forward.</p>
        </div>
        <button className="primary" onClick={create}>
          <Plus size={17} />
          Create project
        </button>
      </div>
      <div className="stats">
        <Stat
          label="Total projects"
          value={projects.length}
          icon={<Folder size={19} />}
          note="Ideas in motion"
        />
        <Stat
          label="Active tasks"
          value={tasks.length - done}
          icon={<Circle size={19} />}
          note="Making steady progress"
        />
        <Stat
          label="Completed tasks"
          value={done}
          icon={<CheckCheck size={20} />}
          note="Small wins, big impact"
        />
      </div>
      <div className="section-heading">
        <div>
          <h2>
            Your projects <span className="count">{projects.length}</span>
          </h2>
          <p>A home for every idea you’re bringing to life.</p>
        </div>
        <label className="search">
          <Search size={17} />
          <input
            aria-label="Search projects"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {loading ? (
        <div className="empty">Loading your projects…</div>
      ) : error ? (
        <div className="error" role="alert">
          {error}
        </div>
      ) : (
        <div className="project-grid">
          {projects
            .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
            .map((p, index) => {
              const completed = p.tasks.filter(
                (t) => t.status === "DONE",
              ).length;
              const progress = p.tasks.length
                ? Math.round((completed / p.tasks.length) * 100)
                : 0;
              return (
                <Link
                  to={`/projects/${p.id}`}
                  key={p.id}
                  className="project-card"
                >
                  <div className="project-card-top">
                    <span className={`folder-icon color-${index % 3}`}>
                      <Folder size={23} />
                    </span>
                    <span className="pill">
                      {p.tasks.length - completed
                        ? "In motion"
                        : "Ready to grow"}
                    </span>
                  </div>
                  <h3>{p.name}</h3>
                  <p>
                    {p.description || "A fresh space for your next great idea."}
                  </p>
                  <div className="progress-caption">
                    <span>Progress</span>
                    <strong>{progress}%</strong>
                  </div>
                  <div className="progress-track">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                  <div className="project-card-footer">
                    <span>
                      {p.tasks.length} tasks · {completed} done
                    </span>
                    <ArrowRight size={18} />
                  </div>
                </Link>
              );
            })}
          <button className="new-project-card" onClick={create}>
            <span>
              <Plus size={25} />
            </span>
            <strong>Start something new</strong>
            <p>Create a project and bring your team together.</p>
          </button>
        </div>
      )}
      <div className="people-banner">
        <div className="people-art">
          <Users size={27} />
        </div>
        <div>
          <h3>The right person. The next great task.</h3>
          <p>See who’s available and give your next idea a head start.</p>
        </div>
        <button className="secondary" onClick={people}>
          View available people
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
function Stat({
  label,
  value,
  icon,
  note,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  note: string;
}) {
  return (
    <div className="stat">
      <div>
        <span>{label}</span>
        <strong>{value.toString().padStart(2, "0")}</strong>
        <small>{note}</small>
      </div>
      <div className="stat-icon">{icon}</div>
    </div>
  );
}
function ProjectForm({ done }: { done: () => void }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: unknown) => api("/projects", "POST", data),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["projects"] });
      done();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <p className="form-intro">Give your next big idea a place to grow.</p>
      <label>
        Project name
        <input
          name="name"
          placeholder="e.g. Summer product launch"
          required
          minLength={2}
          maxLength={100}
          autoFocus
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          placeholder="What are you working toward?"
          maxLength={3000}
          rows={4}
        />
      </label>
      {mutation.error && (
        <p className="error" role="alert">
          {mutation.error.message}
        </p>
      )}
      <button className="primary wide" disabled={mutation.isPending}>
        Create project
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function People({ select }: { select?: (user: User) => void }) {
  const [search, setSearch] = useState("");
  const people = useQuery({
    queryKey: ["people", search],
    queryFn: () =>
      api<User[]>(`/assignees/available?search=${encodeURIComponent(search)}`),
  });
  return (
    <div>
      <p className="form-intro">
        These people have room for a new task. Availability is shared across all
        projects.
      </p>
      <label className="search">
        <Search size={17} />
        <input
          autoFocus
          placeholder="Search by name or email…"
          aria-label="Search available people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {people.isPending && <p>Finding available people…</p>}
      {people.error && (
        <p className="error" role="alert">
          {people.error.message}
        </p>
      )}
      <div className="people-list">
        {people.data?.map((p) => (
          <div className="person" key={p.id}>
            <span className="avatar">{initials(p.name)}</span>
            <div>
              <strong>{p.name}</strong>
              <small>{p.email}</small>
            </div>
            {select ? (
              <button className="secondary" onClick={() => select(p)}>
                Select
              </button>
            ) : (
              <span className="available">
                <i />
                Available
              </span>
            )}
          </div>
        ))}
      </div>
      {people.data?.length === 0 && (
        <div className="empty">
          <Users />
          <h3>No available people</h3>
          <p>Try another search, or wait for an active task to be completed.</p>
        </div>
      )}
    </div>
  );
}
function TaskView({
  user,
  notify,
}: {
  user: User;
  notify: (message: string) => void;
}) {
  const { id: projectId } = useParams();
  const head = user.role === "PROJECT_HEAD";
  const client = useQueryClient();
  const taskKey = ["tasks", projectId ?? "mine"];
  const tasks = useQuery({
    queryKey: taskKey,
    queryFn: () =>
      api<Task[]>(`/tasks${projectId ? `?projectId=${projectId}` : ""}`),
  });
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<Project>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });
  const [assign, setAssign] = useState(false);
  const [selected, setSelected] = useState<Task | null>(null);
  const [transition, setTransition] = useState<{
    task: Task;
    status: Status;
  } | null>(null);
  const [search, setSearch] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor),
  );
  const statusMutation = useMutation({
    mutationFn: ({ task, status }: { task: Task; status: Status }) =>
      api<Task>(`/tasks/${task.id}/status`, "PATCH", { status }),
    onMutate: async ({ task, status }) => {
      await client.cancelQueries({ queryKey: taskKey });
      const previous = client.getQueryData<Task[]>(taskKey);
      client.setQueryData<Task[]>(taskKey, (old) =>
        old?.map((t) => (t.id === task.id ? { ...t, status } : t)),
      );
      return { previous };
    },
    onError: (_err, _data, context) => {
      client.setQueryData(taskKey, context?.previous);
    },
    onSuccess: () => {
      setTransition(null);
      setSelected(null);
      notify("Task status updated.");
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["tasks"] });
      void client.invalidateQueries({ queryKey: ["projects"] });
      void client.invalidateQueries({ queryKey: ["people"] });
    },
  });
  function dragEnd(event: DragEndEvent) {
    const task = tasks.data?.find((t) => t.id === event.active.id);
    if (
      task &&
      event.over &&
      event.over.id !== task.status &&
      event.over.id in labels
    ) {
      statusMutation.reset();
      setTransition({ task, status: event.over.id as Status });
    }
  }
  function change(task: Task, status: Status) {
    statusMutation.reset();
    setTransition({ task, status });
  }
  return (
    <div className="content board-content">
      {projectId && (
        <Link to="/" className="back-link">
          <ArrowLeft size={14} />
          Back to overview
        </Link>
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {head ? "PROJECT WORKSPACE" : "A LITTLE FOCUS. A LOT OF PROGRESS."}
          </div>
          <h1>
            {projectId ? (project.data?.name ?? "Project board") : "My tasks"}
            <span className="heading-dot" />
          </h1>
          <p>
            {projectId
              ? project.data?.description
              : "Your next step is right here. Make it a good one."}
          </p>
        </div>
        {head && projectId && (
          <button className="primary" onClick={() => setAssign(true)}>
            <Plus size={17} />
            Assign task
          </button>
        )}
      </div>
      <div className="board-toolbar">
        <div className="board-tab">
          <LayoutDashboard size={16} />
          Board<span className="count">{tasks.data?.length ?? 0}</span>
        </div>
        <label className="search">
          <Search size={16} />
          <input
            aria-label="Search tasks"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {(tasks.error || project.error) && (
        <p className="error" role="alert">
          {tasks.error?.message ?? project.error?.message}
        </p>
      )}
      {tasks.isPending ? (
        <div className="empty">Loading your tasks…</div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={dragEnd}>
          <div className="kanban">
            {(Object.keys(labels) as Status[]).map((status) => (
              <Column
                key={status}
                status={status}
                tasks={(tasks.data ?? []).filter(
                  (t) =>
                    t.status === status &&
                    `${t.title} ${t.assignee.name}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )}
                open={setSelected}
                assign={
                  head && status === "TODO" ? () => setAssign(true) : undefined
                }
              />
            ))}
          </div>
        </DndContext>
      )}
      <div className="board-hint">
        <span>
          <Zap size={14} />
          One active task per person. More focus, better work.
        </span>
        <span>Drag a card to move it, or open it to change its status.</span>
      </div>
      {assign && projectId && (
        <Modal title="Assign a new task" close={() => setAssign(false)}>
          <TaskForm
            projectId={projectId}
            done={() => {
              setAssign(false);
              notify("Task assigned. Your teammate is in the loop.");
            }}
          />
        </Modal>
      )}
      {selected && (
        <Modal title="Task details" close={() => setSelected(null)}>
          <TaskDetails
            task={tasks.data?.find((t) => t.id === selected.id) ?? selected}
            head={head}
            change={change}
            close={() => setSelected(null)}
            notify={notify}
          />
        </Modal>
      )}
      {transition && (
        <Modal
          title="Move this task?"
          close={() => {
            if (!statusMutation.isPending) setTransition(null);
          }}
        >
          <p className="form-intro">
            Move <strong>{transition.task.title}</strong> from{" "}
            <strong>{labels[transition.task.status]}</strong> to{" "}
            <strong>{labels[transition.status]}</strong>?
          </p>
          {transition.status === "DONE" && (
            <p className="info">
              Completing this task makes the Assignee available for new work.
            </p>
          )}
          {statusMutation.error && (
            <p className="error" role="alert">
              {statusMutation.error.message}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary"
              disabled={statusMutation.isPending}
              onClick={() => setTransition(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate(transition)}
            >
              {statusMutation.isPending ? "Moving…" : "Confirm move"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Column({
  status,
  tasks,
  open,
  assign,
}: {
  status: Status;
  tasks: Task[];
  open: (task: Task) => void;
  assign?: () => void;
}) {
  const drop = useDroppable({ id: status });
  return (
    <section
      ref={drop.setNodeRef}
      className={`kanban-column ${drop.isOver ? "drop-over" : ""}`}
      aria-label={labels[status]}
    >
      <div className="column-heading">
        <span className={`status-dot ${status}`} />
        <h2>{labels[status]}</h2>
        <span className="count">{tasks.length}</span>
        {assign && (
          <button
            className="icon-button"
            aria-label="Add task"
            onClick={assign}
          >
            <Plus size={16} />
          </button>
        )}
      </div>
      <div className="column-cards">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} open={() => open(task)} />
        ))}
        {tasks.length === 0 && (
          <div className="column-empty">
            <span>
              {status === "DONE" ? (
                <CheckCheck size={24} />
              ) : (
                <Folder size={24} />
              )}
            </span>
            <strong>
              {status === "DONE"
                ? "Good things take shape here"
                : "A little breathing room"}
            </strong>
            <p>
              {status === "DONE"
                ? "Completed tasks will stay here as your history."
                : "Drop a task here when you’re ready."}
            </p>
          </div>
        )}
      </div>
      {assign && (
        <button className="add-task" onClick={assign}>
          <Plus size={16} />
          Add task
        </button>
      )}
    </section>
  );
}
function TaskCard({ task, open }: { task: Task; open: () => void }) {
  const drag = useDraggable({ id: task.id });
  return (
    <article
      className={`task-card ${drag.isDragging ? "dragging" : ""}`}
      ref={drag.setNodeRef}
      style={
        drag.transform
          ? {
              transform: `translate3d(${drag.transform.x}px,${drag.transform.y}px,0)`,
              zIndex: 10,
            }
          : undefined
      }
    >
      <div className="task-card-top">
        <span className={`task-tag ${task.status}`}>{task.project.name}</span>
        <button
          className="drag-handle"
          {...drag.listeners}
          {...drag.attributes}
          aria-label={`Drag ${task.title}`}
        >
          ⠿
        </button>
      </div>
      <button className="task-open" onClick={open}>
        <h3>{task.title}</h3>
        <p>{task.description || "Open to see task details."}</p>
      </button>
      <div className="task-card-bottom">
        <span className="task-person">
          <span className="avatar small">{initials(task.assignee.name)}</span>
          {task.assignee.name.split(" ")[0]}
        </span>
        <span>
          {task.status === "DONE" ? (
            <CheckCheck size={15} />
          ) : (
            <Circle size={14} />
          )}
          {task.status === "DONE" ? "Complete" : "View details"}
        </span>
      </div>
    </article>
  );
}
function TaskForm({
  projectId,
  done,
  task,
}: {
  projectId: string;
  done: () => void;
  task?: Task;
}) {
  const [assignee, setAssignee] = useState<User | null>(task?.assignee ?? null);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: unknown) =>
      api(
        task ? `/tasks/${task.id}` : `/projects/${projectId}/tasks`,
        task ? "PATCH" : "POST",
        data,
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tasks"] });
      void client.invalidateQueries({ queryKey: ["people"] });
      void client.invalidateQueries({ queryKey: ["projects"] });
      done();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.currentTarget));
        mutation.mutate(task ? data : { ...data, assigneeId: assignee?.id });
      }}
    >
      <label>
        Task title
        <input
          name="title"
          defaultValue={task?.title}
          placeholder="What needs to be done?"
          required
          minLength={2}
          maxLength={160}
          autoFocus
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          defaultValue={task?.description}
          placeholder="Give your teammate a little context…"
          rows={3}
          maxLength={5000}
        />
      </label>
      {!task && (
        <>
          <label>Assignee</label>
          {assignee ? (
            <div className="selected-person">
              <span className="avatar">{initials(assignee.name)}</span>
              <strong>{assignee.name}</strong>
              <button
                className="text-button"
                type="button"
                onClick={() => setAssignee(null)}
              >
                Change
              </button>
            </div>
          ) : (
            <People select={setAssignee} />
          )}
        </>
      )}
      {mutation.error && (
        <p className="error" role="alert">
          {mutation.error.message}
        </p>
      )}
      <button
        className="primary wide"
        disabled={mutation.isPending || !assignee}
      >
        {mutation.isPending ? "Saving…" : task ? "Save changes" : "Assign task"}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}
function TaskDetails({
  task,
  head,
  change,
  close,
  notify,
}: {
  task: Task;
  head: boolean;
  change: (task: Task, status: Status) => void;
  close: () => void;
  notify: (message: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api(`/tasks/${task.id}`, "DELETE"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["tasks"] });
      void client.invalidateQueries({ queryKey: ["projects"] });
      void client.invalidateQueries({ queryKey: ["people"] });
      close();
      notify("Task deleted.");
    },
  });
  if (edit)
    return (
      <TaskForm
        task={task}
        projectId={task.projectId}
        done={() => {
          setEdit(false);
          notify("Task details saved.");
        }}
      />
    );
  return (
    <div>
      <span className={`task-tag ${task.status}`}>{task.project.name}</span>
      <h2 className="detail-title">{task.title}</h2>
      <p className="detail-description">
        {task.description || "No description added."}
      </p>
      <dl className="details">
        <dt>Assignee</dt>
        <dd>
          <span className="avatar small">{initials(task.assignee.name)}</span>
          {task.assignee.name}
        </dd>
        <dt>Status</dt>
        <dd>
          <select
            aria-label="Task status"
            value={task.status}
            onChange={(e) => change(task, e.target.value as Status)}
          >
            {(Object.keys(labels) as Status[]).map((s) => (
              <option value={s} key={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </dd>
        <dt>Created</dt>
        <dd>{date(task.createdAt)}</dd>
        <dt>Updated</dt>
        <dd>{date(task.updatedAt)}</dd>
        {task.completedAt && (
          <>
            <dt>Completed</dt>
            <dd>{date(task.completedAt)}</dd>
          </>
        )}
      </dl>
      {head && (
        <div className="dialog-actions">
          <button className="secondary" onClick={() => setEdit(true)}>
            Edit task
          </button>
          <button className="danger" onClick={() => setConfirmDelete(true)}>
            Delete task
          </button>
        </div>
      )}
      {confirmDelete && (
        <div className="delete-confirm">
          <p>Delete this task permanently?</p>
          <div className="dialog-actions">
            <button
              className="secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
            <button
              className="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Confirm delete
            </button>
          </div>
        </div>
      )}
      {remove.error && (
        <p className="error" role="alert">
          {remove.error.message}
        </p>
      )}
    </div>
  );
}
