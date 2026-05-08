const state = {
  currentView: "dashboard",
  loading: false,
  error: "",
  flash: "",
  system: null,
  servers: [],
  tools: [],
  prompts: [],
  resources: [],
  toolGroups: [],
  effectiveToolsByGroup: {},
};

const views = [
  ["dashboard", "Dashboard"],
  ["servers", "Servers"],
  ["tools", "Tools"],
  ["prompts", "Prompts"],
  ["resources", "Resources"],
  ["groups", "Tool Groups"],
];

const app = document.querySelector("#app");

init().catch((error) => {
  state.error = error.message;
  render();
});

async function init() {
  bindHashRouting();
  await refreshAll();
  render();
}

function bindHashRouting() {
  const pickView = () => {
    const next = window.location.hash.replace(/^#/, "");
    if (views.some(([id]) => id === next)) {
      state.currentView = next;
    }
  };
  pickView();
  window.addEventListener("hashchange", () => {
    pickView();
    render();
  });
}

async function refreshAll() {
  state.loading = true;
  render();

  try {
    const [
      system,
      servers,
      tools,
      prompts,
      resources,
      toolGroups,
    ] = await Promise.all([
      apiGet("/api/v0/system"),
      apiGet("/api/v0/servers"),
      apiGet("/api/v0/tools"),
      apiGet("/api/v0/prompts"),
      apiGet("/api/v0/resources"),
      apiGet("/api/v0/tool-groups"),
    ]);

    state.system = system;
    state.servers = servers;
    state.tools = tools;
    state.prompts = prompts;
    state.resources = resources;
    state.toolGroups = toolGroups;
    state.error = "";

    const effectiveEntries = await Promise.all(
      state.toolGroups.map(async (group) => {
        const payload = await apiGet(`/api/v0/tool-groups/${encodeURIComponent(group.name)}/effective-tools`);
        return [group.name, payload.tools || []];
      }),
    );
    state.effectiveToolsByGroup = Object.fromEntries(effectiveEntries);
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function refreshSection(section) {
  switch (section) {
    case "servers":
      state.servers = await apiGet("/api/v0/servers");
      return;
    case "tools":
      state.tools = await apiGet("/api/v0/tools");
      return;
    case "prompts":
      state.prompts = await apiGet("/api/v0/prompts");
      return;
    case "resources":
      state.resources = await apiGet("/api/v0/resources");
      return;
    case "groups":
      state.toolGroups = await apiGet("/api/v0/tool-groups");
      state.effectiveToolsByGroup = Object.fromEntries(
        await Promise.all(
          state.toolGroups.map(async (group) => {
            const payload = await apiGet(`/api/v0/tool-groups/${encodeURIComponent(group.name)}/effective-tools`);
            return [group.name, payload.tools || []];
          }),
        ),
      );
      return;
    default:
      await refreshAll();
  }
}

function render() {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">M</div>
          <div>
            <div class="brand-name">MCPJungle</div>
            <div class="brand-subtitle">Local control plane</div>
          </div>
        </div>
        <nav class="nav">
          ${views
            .map(
              ([id, label]) => `
                <a class="nav-link ${state.currentView === id ? "active" : ""}" href="#${id}">
                  ${label}
                </a>
              `,
            )
            .join("")}
        </nav>
        <div class="sidebar-footer">
          <div class="pill">${escapeHtml(state.system?.mode || "loading")}</div>
          <button class="ghost-button" data-action="copy-mcp">Copy /mcp endpoint</button>
        </div>
      </aside>
      <main class="main">
        <header class="hero">
          <div>
            <div class="eyebrow">Development mode UI</div>
            <h1>One endpoint. Now with a local control surface.</h1>
            <p>
              Register servers, inspect tools, render prompts, read resources, and manage tool groups
              without leaving your browser.
            </p>
          </div>
          <div class="hero-card">
            <div class="hero-stat-label">Gateway endpoint</div>
            <div class="hero-stat-value">${escapeHtml(window.location.origin + "/mcp")}</div>
            <div class="hero-stat-meta">Version ${escapeHtml(state.system?.version || "unknown")}</div>
          </div>
        </header>

        ${state.error ? `<section class="banner error">${escapeHtml(state.error)}</section>` : ""}
        ${state.flash ? `<section class="banner success">${escapeHtml(state.flash)}</section>` : ""}
        ${state.loading ? `<section class="banner info">Refreshing MCPJungle state...</section>` : ""}

        ${renderCurrentView()}
      </main>
    </div>
  `;

  bindUIEvents();
}

function renderCurrentView() {
  switch (state.currentView) {
    case "servers":
      return renderServersView();
    case "tools":
      return renderToolsView();
    case "prompts":
      return renderPromptsView();
    case "resources":
      return renderResourcesView();
    case "groups":
      return renderGroupsView();
    default:
      return renderDashboardView();
  }
}

function renderDashboardView() {
  const cards = [
    ["Servers", state.servers.length],
    ["Tools", state.tools.length],
    ["Prompts", state.prompts.length],
    ["Resources", state.resources.length],
    ["Tool Groups", state.toolGroups.length],
  ];

  return `
    <section class="panel-grid metrics-grid">
      ${cards
        .map(
          ([label, value]) => `
            <article class="metric-card">
              <div class="metric-label">${label}</div>
              <div class="metric-value">${value}</div>
            </article>
          `,
        )
        .join("")}
    </section>

    <section class="panel-grid">
      <article class="panel">
        <div class="panel-header">
          <h2>Server Snapshot</h2>
          <button class="ghost-button" data-action="refresh-all">Refresh</button>
        </div>
        ${renderMiniServersTable()}
      </article>
      <article class="panel">
        <div class="panel-header">
          <h2>Tool Group Snapshot</h2>
        </div>
        ${renderMiniGroupList()}
      </article>
    </section>
  `;
}

function renderServersView() {
  return `
    <section class="panel form-panel">
      <div class="panel-header">
        <h2>Register MCP Server</h2>
        <button class="ghost-button" data-action="refresh-servers">Refresh list</button>
      </div>
      <form id="server-form" class="stack">
        <div class="grid two">
          <label>Name<input name="name" required placeholder="context7" /></label>
          <label>Transport
            <select name="transport">
              <option value="streamable_http">Streamable HTTP</option>
              <option value="stdio">STDIO</option>
              <option value="sse">SSE</option>
            </select>
          </label>
        </div>
        <label>Description<input name="description" placeholder="Optional description" /></label>
        <div class="grid two">
          <label>Session mode
            <select name="session_mode">
              <option value="stateless">stateless</option>
              <option value="stateful">stateful</option>
            </select>
          </label>
          <label>URL<input name="url" placeholder="https://example.com/mcp" /></label>
        </div>
        <div class="grid two">
          <label>Command<input name="command" placeholder="npx" /></label>
          <label>Args (JSON array)<textarea name="args" rows="3">[]</textarea></label>
        </div>
        <div class="grid two">
          <label>Env (JSON object)<textarea name="env" rows="4">{}</textarea></label>
          <label>Headers (JSON object)<textarea name="headers" rows="4">{}</textarea></label>
        </div>
        <label>Bearer token<input name="bearer_token" placeholder="Optional for HTTP/SSE upstreams" /></label>
        <div class="actions">
          <button type="submit">Register server</button>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>Registered Servers</h2>
      </div>
      ${renderServersTable()}
    </section>
  `;
}

function renderToolsView() {
  return `
    <section class="panel">
      <div class="panel-header">
        <h2>Invoke Tool</h2>
        <button class="ghost-button" data-action="refresh-tools">Refresh tools</button>
      </div>
      <form id="tool-invoke-form" class="stack">
        <label>Tool
          <select name="name">
            ${state.tools.map((tool) => `<option value="${escapeAttr(tool.name)}">${escapeHtml(tool.name)}</option>`).join("")}
          </select>
        </label>
        <label>Arguments (JSON object)<textarea name="arguments" rows="6">{}</textarea></label>
        <div class="actions">
          <button type="submit">Invoke tool</button>
        </div>
      </form>
      <pre class="result-box" id="tool-result">Run a tool to inspect the response.</pre>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>Tools</h2>
      </div>
      ${renderToolsTable()}
    </section>
  `;
}

function renderPromptsView() {
  return `
    <section class="panel">
      <div class="panel-header">
        <h2>Render Prompt</h2>
        <button class="ghost-button" data-action="refresh-prompts">Refresh prompts</button>
      </div>
      <form id="prompt-render-form" class="stack">
        <label>Prompt
          <select name="name">
            ${state.prompts.map((prompt) => `<option value="${escapeAttr(prompt.name)}">${escapeHtml(prompt.name)}</option>`).join("")}
          </select>
        </label>
        <label>Arguments (JSON object of string values)<textarea name="arguments" rows="6">{}</textarea></label>
        <div class="actions">
          <button type="submit">Render prompt</button>
        </div>
      </form>
      <pre class="result-box" id="prompt-result">Render a prompt to inspect the response.</pre>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>Prompts</h2>
      </div>
      ${renderPromptsTable()}
    </section>
  `;
}

function renderResourcesView() {
  return `
    <section class="panel">
      <div class="panel-header">
        <h2>Read Resource</h2>
        <button class="ghost-button" data-action="refresh-resources">Refresh resources</button>
      </div>
      <form id="resource-read-form" class="stack">
        <label>Resource
          <select name="uri">
            ${state.resources.map((resource) => `<option value="${escapeAttr(resource.uri)}">${escapeHtml(resource.name)}</option>`).join("")}
          </select>
        </label>
        <div class="actions">
          <button type="submit">Read resource</button>
        </div>
      </form>
      <pre class="result-box" id="resource-result">Read a resource to inspect the response.</pre>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>Resources</h2>
      </div>
      ${renderResourcesTable()}
    </section>
  `;
}

function renderGroupsView() {
  return `
    <section class="panel form-panel">
      <div class="panel-header">
        <h2>Create Tool Group</h2>
        <button class="ghost-button" data-action="refresh-groups">Refresh groups</button>
      </div>
      <form id="group-form" class="stack">
        <div class="grid two">
          <label>Name<input name="name" required placeholder="code-review" /></label>
          <label>Description<input name="description" placeholder="Optional description" /></label>
        </div>
        <label>Included tools (comma-separated)<textarea name="included_tools" rows="3"></textarea></label>
        <label>Included servers (comma-separated)<textarea name="included_servers" rows="3"></textarea></label>
        <label>Excluded tools (comma-separated)<textarea name="excluded_tools" rows="3"></textarea></label>
        <div class="actions">
          <button type="submit">Create group</button>
        </div>
      </form>
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>Tool Groups</h2>
      </div>
      ${renderGroupsTable()}
    </section>
  `;
}

function renderMiniServersTable() {
  if (!state.servers.length) {
    return `<p class="empty">No MCP servers registered yet.</p>`;
  }
  return `
    <table>
      <thead><tr><th>Name</th><th>Transport</th><th>Session</th></tr></thead>
      <tbody>
        ${state.servers
          .slice(0, 5)
          .map(
            (server) => `
              <tr>
                <td>${escapeHtml(server.name)}</td>
                <td>${escapeHtml(server.transport)}</td>
                <td>${escapeHtml(server.session_mode || "stateless")}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderMiniGroupList() {
  if (!state.toolGroups.length) {
    return `<p class="empty">No tool groups yet.</p>`;
  }
  return `
    <div class="list-stack">
      ${state.toolGroups
        .slice(0, 4)
        .map(
          (group) => `
            <article class="inline-card">
              <div>
                <strong>${escapeHtml(group.name)}</strong>
                <p>${escapeHtml(group.description || "No description")}</p>
              </div>
              <span class="pill">${(state.effectiveToolsByGroup[group.name] || []).length} tools</span>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderServersTable() {
  if (!state.servers.length) {
    return `<p class="empty">No servers registered yet.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Transport</th>
          <th>Target</th>
          <th>Session</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${state.servers
          .map((server) => {
            const target = server.url || [server.command, ...(server.args || [])].filter(Boolean).join(" ");
            return `
              <tr>
                <td>${escapeHtml(server.name)}</td>
                <td>${escapeHtml(server.transport)}</td>
                <td><code>${escapeHtml(target || "n/a")}</code></td>
                <td>${escapeHtml(server.session_mode || "stateless")}</td>
                <td class="action-row">
                  <button class="mini-button" data-action="server-enable" data-name="${escapeAttr(server.name)}">Enable</button>
                  <button class="mini-button" data-action="server-disable" data-name="${escapeAttr(server.name)}">Disable</button>
                  <button class="mini-button danger" data-action="server-delete" data-name="${escapeAttr(server.name)}">Delete</button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function renderToolsTable() {
  if (!state.tools.length) {
    return `<p class="empty">No tools discovered yet.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Enabled</th>
          <th>Description</th>
          <th>Schema</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${state.tools
          .map(
            (tool) => `
              <tr>
                <td>${escapeHtml(tool.name)}</td>
                <td>${tool.enabled ? "yes" : "no"}</td>
                <td>${escapeHtml(tool.description || "")}</td>
                <td><details><summary>input</summary><pre>${escapeHtml(pretty(tool.input_schema))}</pre></details></td>
                <td class="action-row">
                  <button class="mini-button" data-action="tool-enable" data-name="${escapeAttr(tool.name)}">Enable</button>
                  <button class="mini-button" data-action="tool-disable" data-name="${escapeAttr(tool.name)}">Disable</button>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderPromptsTable() {
  if (!state.prompts.length) {
    return `<p class="empty">No prompts discovered yet.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Enabled</th>
          <th>Description</th>
          <th>Arguments</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${state.prompts
          .map(
            (prompt) => `
              <tr>
                <td>${escapeHtml(prompt.name)}</td>
                <td>${prompt.enabled ? "yes" : "no"}</td>
                <td>${escapeHtml(prompt.description || "")}</td>
                <td><details><summary>args</summary><pre>${escapeHtml(pretty(prompt.arguments))}</pre></details></td>
                <td class="action-row">
                  <button class="mini-button" data-action="prompt-enable" data-name="${escapeAttr(prompt.name)}">Enable</button>
                  <button class="mini-button" data-action="prompt-disable" data-name="${escapeAttr(prompt.name)}">Disable</button>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderResourcesTable() {
  if (!state.resources.length) {
    return `<p class="empty">No resources discovered yet.</p>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Enabled</th>
          <th>MIME type</th>
          <th>URI</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${state.resources
          .map(
            (resource) => `
              <tr>
                <td>${escapeHtml(resource.name)}</td>
                <td>${resource.enabled ? "yes" : "no"}</td>
                <td>${escapeHtml(resource.mime_type || "")}</td>
                <td><code>${escapeHtml(resource.uri)}</code></td>
                <td class="action-row">
                  <button class="mini-button" data-action="resource-enable" data-name="${escapeAttr(resource.uri)}">Enable</button>
                  <button class="mini-button" data-action="resource-disable" data-name="${escapeAttr(resource.uri)}">Disable</button>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderGroupsTable() {
  if (!state.toolGroups.length) {
    return `<p class="empty">No tool groups created yet.</p>`;
  }

  return `
    <div class="list-stack">
      ${state.toolGroups
        .map((group) => {
          const effectiveTools = state.effectiveToolsByGroup[group.name] || [];
          return `
            <article class="group-card">
              <div class="group-header">
                <div>
                  <h3>${escapeHtml(group.name)}</h3>
                  <p>${escapeHtml(group.description || "No description")}</p>
                </div>
                <div class="action-row">
                  <button class="mini-button danger" data-action="group-delete" data-name="${escapeAttr(group.name)}">Delete</button>
                </div>
              </div>
              <form class="stack group-edit-form" data-group-name="${escapeAttr(group.name)}">
                <div class="grid two">
                  <label>Name<input name="name" value="${escapeAttr(group.name)}" required /></label>
                  <label>Description<input name="description" value="${escapeAttr(group.description || "")}" /></label>
                </div>
                <label>Included tools<textarea name="included_tools" rows="2">${escapeHtml((group.included_tools || []).join(", "))}</textarea></label>
                <label>Included servers<textarea name="included_servers" rows="2">${escapeHtml((group.included_servers || []).join(", "))}</textarea></label>
                <label>Excluded tools<textarea name="excluded_tools" rows="2">${escapeHtml((group.excluded_tools || []).join(", "))}</textarea></label>
                <div class="actions">
                  <button type="submit">Save changes</button>
                </div>
              </form>
              <details>
                <summary>Effective tools (${effectiveTools.length})</summary>
                <pre>${escapeHtml(pretty(effectiveTools))}</pre>
              </details>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function bindUIEvents() {
  for (const button of document.querySelectorAll("[data-action]")) {
    button.addEventListener("click", handleActionClick);
  }

  document.querySelector("#server-form")?.addEventListener("submit", handleServerSubmit);
  document.querySelector("#tool-invoke-form")?.addEventListener("submit", handleToolInvokeSubmit);
  document.querySelector("#prompt-render-form")?.addEventListener("submit", handlePromptRenderSubmit);
  document.querySelector("#resource-read-form")?.addEventListener("submit", handleResourceReadSubmit);
  document.querySelector("#group-form")?.addEventListener("submit", handleGroupCreateSubmit);
  for (const form of document.querySelectorAll(".group-edit-form")) {
    form.addEventListener("submit", handleGroupEditSubmit);
  }
}

async function handleActionClick(event) {
  const action = event.currentTarget.dataset.action;
  const name = event.currentTarget.dataset.name || "";

  try {
    switch (action) {
      case "copy-mcp":
        await navigator.clipboard.writeText(`${window.location.origin}/mcp`);
        setFlash("Copied MCP endpoint.");
        return;
      case "refresh-all":
        await refreshAll();
        return;
      case "refresh-servers":
        await refreshSection("servers");
        render();
        return;
      case "refresh-tools":
        await refreshSection("tools");
        render();
        return;
      case "refresh-prompts":
        await refreshSection("prompts");
        render();
        return;
      case "refresh-resources":
        await refreshSection("resources");
        render();
        return;
      case "refresh-groups":
        await refreshSection("groups");
        render();
        return;
      case "server-enable":
        await apiPost(`/api/v0/servers/${encodeURIComponent(name)}/enable`);
        await refreshAll();
        setFlash(`Enabled server ${name}.`);
        return;
      case "server-disable":
        await apiPost(`/api/v0/servers/${encodeURIComponent(name)}/disable`);
        await refreshAll();
        setFlash(`Disabled server ${name}.`);
        return;
      case "server-delete":
        if (window.confirm(`Delete server ${name}?`)) {
          await apiDelete(`/api/v0/servers/${encodeURIComponent(name)}`);
          await refreshAll();
          setFlash(`Deleted server ${name}.`);
        }
        return;
      case "tool-enable":
        await apiPost(`/api/v0/tools/enable?entity=${encodeURIComponent(name)}`);
        await refreshSection("tools");
        render();
        setFlash(`Enabled tool ${name}.`);
        return;
      case "tool-disable":
        await apiPost(`/api/v0/tools/disable?entity=${encodeURIComponent(name)}`);
        await refreshSection("tools");
        render();
        setFlash(`Disabled tool ${name}.`);
        return;
      case "prompt-enable":
        await apiPost(`/api/v0/prompts/enable?entity=${encodeURIComponent(name)}`);
        await refreshSection("prompts");
        render();
        setFlash(`Enabled prompt ${name}.`);
        return;
      case "prompt-disable":
        await apiPost(`/api/v0/prompts/disable?entity=${encodeURIComponent(name)}`);
        await refreshSection("prompts");
        render();
        setFlash(`Disabled prompt ${name}.`);
        return;
      case "resource-enable":
        await apiPost(`/api/v0/resources/enable?entity=${encodeURIComponent(name)}`);
        await refreshSection("resources");
        render();
        setFlash("Enabled resource.");
        return;
      case "resource-disable":
        await apiPost(`/api/v0/resources/disable?entity=${encodeURIComponent(name)}`);
        await refreshSection("resources");
        render();
        setFlash("Disabled resource.");
        return;
      case "group-delete":
        if (window.confirm(`Delete tool group ${name}?`)) {
          await apiDelete(`/api/v0/tool-groups/${encodeURIComponent(name)}`);
          await refreshSection("groups");
          render();
          setFlash(`Deleted tool group ${name}.`);
        }
        return;
      default:
        return;
    }
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function handleServerSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const payload = {
      name: form.name.value.trim(),
      description: form.description.value.trim(),
      transport: form.transport.value,
      session_mode: form.session_mode.value,
    };

    maybeAssign(payload, "url", form.url.value.trim());
    maybeAssign(payload, "command", form.command.value.trim());
    maybeAssign(payload, "bearer_token", form.bearer_token.value.trim());
    maybeAssign(payload, "args", parseJSON(form.args.value, "Args must be valid JSON."));
    maybeAssign(payload, "env", parseJSON(form.env.value, "Env must be valid JSON."));
    maybeAssign(payload, "headers", parseJSON(form.headers.value, "Headers must be valid JSON."));

    await apiPost("/api/v0/servers", payload);
    form.reset();
    form.transport.value = "streamable_http";
    form.session_mode.value = "stateless";
    form.args.value = "[]";
    form.env.value = "{}";
    form.headers.value = "{}";
    await refreshAll();
    setFlash(`Registered server ${payload.name}.`);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function handleToolInvokeSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const payload = parseJSONObject(form.arguments.value, "Arguments must be a JSON object.");
    payload.name = form.name.value;
    const result = await apiPost("/api/v0/tools/invoke", payload);
    document.querySelector("#tool-result").textContent = pretty(result);
    setFlash(`Invoked tool ${payload.name}.`);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function handlePromptRenderSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const argumentsObject = parseJSONObject(form.arguments.value, "Arguments must be a JSON object.");
    const normalized = {};
    for (const [key, value] of Object.entries(argumentsObject)) {
      normalized[key] = String(value);
    }
    const result = await apiPost("/api/v0/prompts/render", {
      name: form.name.value,
      arguments: normalized,
    });
    document.querySelector("#prompt-result").textContent = pretty(result);
    setFlash(`Rendered prompt ${form.name.value}.`);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function handleResourceReadSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const result = await apiPost("/api/v0/resources/read", { uri: form.uri.value });
    document.querySelector("#resource-result").textContent = pretty(result);
    setFlash("Read resource.");
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function handleGroupCreateSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await apiPost("/api/v0/tool-groups", {
      name: form.name.value.trim(),
      description: form.description.value.trim(),
      included_tools: parseCSV(form.included_tools.value),
      included_servers: parseCSV(form.included_servers.value),
      excluded_tools: parseCSV(form.excluded_tools.value),
    });
    form.reset();
    await refreshSection("groups");
    render();
    setFlash("Created tool group.");
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function handleGroupEditSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const originalName = form.dataset.groupName;
  try {
    await apiPut(`/api/v0/tool-groups/${encodeURIComponent(originalName)}`, {
      name: form.name.value.trim(),
      description: form.description.value.trim(),
      included_tools: parseCSV(form.included_tools.value),
      included_servers: parseCSV(form.included_servers.value),
      excluded_tools: parseCSV(form.excluded_tools.value),
    });
    await refreshSection("groups");
    render();
    setFlash(`Updated tool group ${originalName}.`);
  } catch (error) {
    state.error = error.message;
    render();
  }
}

async function apiGet(url) {
  return request(url, { method: "GET" });
}

async function apiPost(url, body) {
  return request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiPut(url, body) {
  return request(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function apiDelete(url) {
  return request(url, { method: "DELETE" });
}

async function request(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? safeParseJSON(text) : null;

  if (!response.ok) {
    throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  }

  return payload;
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function parseJSON(text, errorMessage) {
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(errorMessage);
  }
}

function parseJSONObject(text, errorMessage) {
  const value = parseJSON(text, errorMessage);
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new Error(errorMessage);
  }
  return value;
}

function parseCSV(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function maybeAssign(target, key, value) {
  if (value === undefined) {
    return;
  }
  if (typeof value === "string" && value === "") {
    return;
  }
  if (typeof value === "object" && value !== null) {
    if (Array.isArray(value) && value.length === 0) {
      return;
    }
    if (!Array.isArray(value) && Object.keys(value).length === 0) {
      return;
    }
  }
  target[key] = value;
}

function pretty(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return JSON.stringify(value, null, 2);
}

function setFlash(message) {
  state.flash = message;
  state.error = "";
  render();
  window.clearTimeout(setFlash.timeoutID);
  setFlash.timeoutID = window.setTimeout(() => {
    state.flash = "";
    render();
  }, 2500);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
