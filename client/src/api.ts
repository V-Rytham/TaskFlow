export type User = {
  id: string;
  name: string;
  email: string;
  role: "PROJECT_HEAD" | "ASSIGNEE";
};
export type Status = "TODO" | "IN_PROGRESS" | "DONE";
export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  tasks: { status: Status; assigneeId: string }[];
};
export type Task = {
  id: string;
  title: string;
  description: string;
  status: Status;
  projectId: string;
  assigneeId: string;
  project: Project;
  assignee: User;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("taskflow:unauthorized"));
    const body = await response
      .json()
      .catch(() => ({ error: "Unable to reach the server." }));
    throw new Error(body.error);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
