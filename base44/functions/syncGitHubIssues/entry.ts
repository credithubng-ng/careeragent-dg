import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const repo = body.repo; // optional "owner/repo"

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("github");
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "CareerAgent-DG"
    };

    let owner, name;
    if (repo && repo.includes("/")) {
      [owner, name] = repo.split("/");
    } else {
      const meRes = await fetch("https://api.github.com/user", { headers });
      const me = await meRes.json();
      owner = me.login;
      name = repo || "career-agent-dg";
    }

    let res = await fetch(`https://api.github.com/repos/${owner}/${name}/issues?state=open&per_page=100&sort=updated&direction=desc`, { headers });
    if (res.status === 404) {
      // fall back to open issues assigned to the user across all their repos
      res = await fetch("https://api.github.com/issues?state=open&per_page=100&sort=updated&direction=desc", { headers });
    }
    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `GitHub API ${res.status}: ${errText}` }, { status: 502 });
    }
    const items = await res.json();
    const issues = items
      .filter((i) => !i.pull_request)
      .map((i) => ({
        id: i.id,
        number: i.number,
        title: i.title,
        state: i.state,
        url: i.html_url,
        repo: i.repository_url
          ? i.repository_url.replace("https://api.github.com/repos/", "")
          : (i.repository ? i.repository.full_name : `${owner}/${name}`),
        labels: (i.labels || []).map((l) => l.name),
        created_at: i.created_at,
        updated_at: i.updated_at,
        assignee: i.assignee ? i.assignee.login : null
      }));

    return Response.json({ issues, repo: `${owner}/${name}`, count: issues.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}