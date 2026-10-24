import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
} from "reactflow";

import "reactflow/dist/style.css";
import { useEffect, useRef, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:5000";
const INVESTIGATION_ID = "6ad8e89e80ae3257d686875c";
const initialEvidence = [];

const initialEvents = [];

const navItems = [
  { name: "Dashboard", icon: "▦" },
  { name: "Uploaded Files", icon: "▤" },
  { name: "Check for Threats", icon: "⌕" },
  { name: "How Evidence Connects", icon: "⌘" },
  { name: "Event Timeline", icon: "◷" },
  { name: "Reports", icon: "▧" },
];

function StatCard({ label, value, detail, icon, color }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}

function EvidenceTable({ evidence, onDelete, running = false }) {
  return (
    <div className="table-wrap">
      <table className="evidence-table">
        <thead>
          <tr>
            <th>File Name</th>
            <th>File Type</th>
            <th>Status</th>
            {onDelete && <th>Action</th>}
          </tr>
        </thead>

        <tbody>
          {evidence.map((item) => (
            <tr key={item.id}>
              <td>
                <span className="file-symbol">▤</span>
                {item.name}
              </td>
              <td>{item.type}</td>
              <td>
                <span
                  className={`status-badge ${
                    item.status === "Analyzed"
                      ? "status-done"
                      : "status-pending"
                  }`}
                >
                  {item.status}
                </span>
              </td>
              {onDelete && (
                <td>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => onDelete(item)}
                    style={{
                      color: "#dc2626",
                      background: "#fff1f2",
                      border: "1px solid #fecdd3",
                      borderRadius: "8px",
                      padding: "7px 12px",
                      cursor: running ? "not-allowed" : "pointer",
                    }}
                  >
                    {running ? "Please wait..." : "Delete"}
                  </button>
                </td>
              )}
            </tr>
          ))}

          {evidence.length === 0 && (
            <tr>
              <td colSpan={onDelete ? 4 : 3}>No files uploaded yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CircleNode({ data }) {
  const isIndicator = data.kind === "shared-indicator";

  return (
    <div
      style={{
        width: 130,
        height: 130,
        borderRadius: "50%",
        border: `2px solid ${isIndicator ? "#22c55e" : "#60a5fa"}`,
        background: isIndicator ? "#f0fdf4" : "#eff6ff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 12,
        boxSizing: "border-box",
        overflowWrap: "anywhere",
        fontSize: 12,
        fontWeight: 600,
        color: "#1f2937",
      }}
    >
      <Handle type="target" position={Position.Top} />
      {data.label}
      <small style={{ marginTop: 6, color: "#64748b" }}>
        {isIndicator ? "Shared indicator" : "Evidence proof"}
      </small>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

function AttackGraph({ result }) {
  if (!result?.nodes?.length) {
    return (
      <p>
        Upload and analyze evidence to display the attack graph.
      </p>
    );
  }

  const evidenceNodes = result.nodes.filter(
    (node) => node.type === "evidence"
  );

  const indicatorNodes = result.nodes.filter(
    (node) => node.type === "shared-indicator"
  );

  const graphWidth =
    Math.max(evidenceNodes.length, indicatorNodes.length, 1) * 190;

  const nodes = result.nodes.map((node) => {
    const isIndicator = node.type === "shared-indicator";

    const group = isIndicator ? indicatorNodes : evidenceNodes;
    const index = group.findIndex((item) => item.id === node.id);

    return {
      id: node.id,
      type: "circle",
      position: {
        x:
          index * 190 +
          (graphWidth - group.length * 190) / 2,
        y: isIndicator ? 230 : 30,
      },
      data: {
        label: node.label,
        kind: node.type,
      },
    };
  });

  const edges = result.edges.map((edge, index) => ({
    id: `${edge.source}-${edge.target}-${index}`,
    source: edge.source,
    target: edge.target,
    label: "Same indicator",
    type: "smoothstep",
    style: { stroke: "#94a3b8", strokeWidth: 2 },
    labelStyle: { fill: "#64748b", fontSize: 10 },
  }));

  return (
    <div style={{ width: "100%", height: 430 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ circle: CircleNode }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
      >
        <Background color="#e5e7eb" gap={20} />
        <Controls />
      </ReactFlow>

      <p style={{ fontSize: 12, color: "#64748b" }}>
        Blue circles = evidence files · Green circles = shared indicators.
        Lines show matching indicators, not confirmed attacker identity.
      </p>
    </div>
  );
}

export default function App() {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [evidence, setEvidence] = useState(initialEvidence);
  const [events, setEvents] = useState(initialEvents);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("Connecting to your saved investigation...");
  const [correlationResult, setCorrelationResult] = useState(null);
  const [investigationLoaded, setInvestigationLoaded] = useState(false);

  const fileRef = useRef(null);

  function mapEvidence(items = []) {
    return items.map((item) => ({
      id: String(item._id || item.id || item.fileName),
      evidenceId: String(item._id || item.id || ""),
      name: item.fileName || item.name || "Unnamed file",
      type: (item.fileType || item.type || "unknown").includes("image") ? "Image"
        : (item.fileType || item.type || "").includes("audio") ? "Audio"
        : /\.pdf$/i.test(item.fileName || item.name || "") ? "PDF"
        : "Text",
      status: item.extractedText || (item.indicators || []).length ? "Analyzed" : "Uploaded",
      indicators: item.indicators || [],
      extractedText: item.extractedText || "",
      fileType: item.fileType || "unknown",
      fileSize: item.fileSize || 0,
    }));
  }

  async function refreshInvestigation() {
    const response = await fetch(`${API_BASE}/api/investigations/${INVESTIGATION_ID}`);
    const data = await response.json();
    if (!response.ok || data.success === false) {
      throw new Error(data.message || "Could not load investigation from backend.");
    }
    const record = data.investigation || data.data || data;
    setEvidence(mapEvidence(record.evidence || []));
    setEvents((record.timeline || []).map((event) => ({
      time: event.timestamp ? new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Saved event",
      title: event.title || event.description || "Investigation event",
      source: event.source || event.eventType || "Backend",
      type: event.eventType === "correlation-generated" ? "success" : "info",
    })).reverse());
    setInvestigationLoaded(true);
    return record;
  }

  useEffect(() => {
    refreshInvestigation()
      .then(() => setNotice("Connected to the saved investigation. Upload evidence to begin."))
      .catch((error) => setNotice(`Backend connection failed: ${error.message}`));
  }, []);

  const pageTitle = {
    Dashboard: "Dashboard",
    "Uploaded Files": "Uploaded Files",
    "Check for Threats": "Check for Threats",
    "How Evidence Connects": "How Evidence Connects",
    "Event Timeline": "Event Timeline",
    Reports: "Reports",
  }[activeNav];

  async function addFiles(files) {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;

    const allowedExtensions = /\.(txt|png|jpe?g|webp|wav|mp3|m4a|ogg|webm)$/i;
    const validFiles = incoming.filter((file) =>
      file.type.startsWith("image/") || file.type.startsWith("audio/") || allowedExtensions.test(file.name)
    );

    if (!validFiles.length) {
      setNotice("Choose TXT, PNG, JPG, WEBP, WAV, MP3, M4A, OGG or WEBM files. TXT analysis is currently supported.");
      return;
    }

    setRunning(true);
    let uploaded = 0;
    const errors = [];
    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append("evidence", file);
        const response = await fetch(`${API_BASE}/api/investigations/${INVESTIGATION_ID}/evidence`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        if (!response.ok || data.success === false) throw new Error(data.message || `Upload failed for ${file.name}`);
        uploaded += 1;
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`);
      }
    }

    try { await refreshInvestigation(); } catch (error) { errors.push(error.message); }
    setSelectedFiles((prev) => [...prev, ...validFiles]);
    setRunning(false);
    setNotice(`${uploaded} file(s) uploaded to the backend.${errors.length ? ` Issues: ${errors.join("; ")}` : " You can now analyze evidence."}`);
  }

  async function runAnalysis() {
    if (running) return;
    setRunning(true);
    setNotice("Analyzing supported text evidence and comparing shared indicators...");

    try {
      let record = await refreshInvestigation();
      const filesToAnalyze = (record.evidence || []).filter((item) => {
  const name = item.fileName || "";
  const isSupported = /\.(txt|png|jpe?g|webp)$/i.test(name);
  const isImage = /\.(png|jpe?g|webp)$/i.test(name);

  // Re-analyze images so QR codes are checked too.
  return isSupported && (!item.extractedText || isImage);
});

      for (const item of filesToAnalyze) {
        const response = await fetch(`${API_BASE}/api/investigations/${INVESTIGATION_ID}/evidence/${item._id}/analyze`, {
          method: "POST",
        });
        const data = await response.json();
        if (!response.ok || data.success === false) throw new Error(data.message || `Could not analyze ${item.fileName}`);
      }

      const response = await fetch(`${API_BASE}/api/correlations/${INVESTIGATION_ID}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data.message || "Correlation failed.");

      setCorrelationResult(data.result || null);
      await refreshInvestigation();
      setNotice(`Analysis complete: ${data.result?.summary?.sharedIndicators ?? 0} shared indicator(s) found across your evidence files.`);
      setActiveNav("How Evidence Connects");
    } catch (error) {
      setNotice(`Analysis failed: ${error.message}`);
    } finally {
      setRunning(false);
    }
  }

  async function deleteEvidence(item) {
    if (!item?.evidenceId) {
      setNotice("This file has no backend evidence ID, so it cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Delete "${item.name}" from this investigation? This cannot be undone.`
    );

    if (!confirmed || running) return;

    setRunning(true);
    setNotice(`Deleting "${item.name}"...`);

    try {
      const response = await fetch(
        `${API_BASE}/api/investigations/${INVESTIGATION_ID}/evidence/${item.evidenceId}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "Could not delete evidence.");
      }

      // Recalculate connections after deleting the selected evidence record.
      const correlationResponse = await fetch(
        `${API_BASE}/api/correlations/${INVESTIGATION_ID}`,
        { method: "POST" }
      );
      const correlationData = await correlationResponse.json();

      if (!correlationResponse.ok || correlationData.success === false) {
        await refreshInvestigation();
        setCorrelationResult(null);
        throw new Error(
          "Evidence was deleted, but correlation refresh failed. Click Analyze Evidence to rebuild connections."
        );
      }

      setCorrelationResult(correlationData.result || null);
      await refreshInvestigation();
      setNotice(`Deleted "${item.name}". The evidence list and connections are updated.`);
    } catch (error) {
      setNotice(`Delete failed: ${error.message}`);
      try {
        await refreshInvestigation();
      } catch {
        // Keep the delete error visible if refresh also fails.
      }
    } finally {
      setRunning(false);
    }
  }

  function downloadReport() {
    const report = {
      product: "CyberChronicle",
      reportType: "Investigation summary",
      generatedAt: new Date().toISOString(),
      disclaimer:
        "This report contains backend investigation records and indicator matches. Shared indicators are not proof of attacker identity or confirmed malicious activity.",
      files: evidence.map(({ name, type, status }) => ({
        name,
        type,
        status,
      })),
      events,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "CyberChronicle-Report.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);

    setNotice("Investigation summary downloaded as a JSON file.");
  }

  return (
    <div className="app-shell">
      {/* LEFT SIDEBAR */}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            C<span>✳</span>
          </div>

          <div>
            <h2>CyberChronicle</h2>
            <p>CYBER INVESTIGATION</p>
          </div>
        </div>

        <div className="workspace-label">YOUR WORKSPACE</div>

        <button
          className={`incident-switch ${
            activeNav === "Dashboard" ? "selected" : ""
          }`}
          onClick={() => setActiveNav("Dashboard")}
        >
          <span className="incident-dot" />

          <span>
            <strong>Investigation #001</strong>
            <small>Sample phishing case</small>
          </span>

          <span className="switch-arrow">⌄</span>
        </button>

        <div className="nav-label">MENU</div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${
                activeNav === item.name ? "active" : ""
              }`}
              onClick={() => setActiveNav(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>

              {item.name}

              {item.name === "Uploaded Files" && (
                <span className="nav-count">{evidence.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <span className="security-icon">◈</span>

            <strong>Keep evidence organized</strong>

            <p>
              Upload files and review the information collected for your
              investigation.
            </p>
          </div>

          <div className="profile">
            <div className="avatar">NP</div>

            <div>
              <strong>NullPointer</strong>
              <small>Investigation workspace</small>
            </div>

            <span className="profile-menu">•••</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span>/</span>
            <strong>{pageTitle}</strong>
          </div>

          <div className="top-actions">
            <span className="system-status">
              <i />
              {investigationLoaded ? "Backend connected" : "Connecting..."}
            </span>

            <div className="avatar small-avatar">NP</div>
          </div>
        </header>

        <div className="page-content">
          {/* PAGE HEADING */}

          <section className="page-heading">
            <div>
              <div className="eyebrow">
                CYBER INVESTIGATION <span>•</span> CASE #001
              </div>

              <h1>{pageTitle}</h1>

              <p>
                Upload files, find suspicious details and understand how
                evidence may be connected.
              </p>
            </div>

            <div className="heading-actions">
              <button
                className="btn btn-secondary"
                onClick={downloadReport}
              >
                ↓ Download Report
              </button>

              <button
                className="btn btn-primary"
                onClick={() => fileRef.current?.click()}
              >
                + Upload Files
              </button>

              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,audio/*,.txt,.eml,.csv,.pdf,.json"
                hidden
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
          </section>

          {/* NOTIFICATION */}

          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>

              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss message"
              >
                ×
              </button>
            </div>
          )}

          {/* DASHBOARD */}

          {activeNav === "Dashboard" && (
            <>
              <section className="stat-grid">
                <StatCard
                  label="Files Uploaded"
                  value={String(evidence.length).padStart(2, "0")}
                  detail="Files in this session"
                  icon="▤"
                  color="blue"
                />

                <StatCard
                  label="Extracted Indicators"
                  value={String(evidence.reduce((sum, item) => sum + item.indicators.length, 0)).padStart(2, "0")}
                  detail="From analyzed evidence"
                  icon="⌕"
                  color="purple"
                />

                <StatCard
                  label="Shared Matches"
                  value={String(correlationResult?.summary?.sharedIndicators ?? 0).padStart(2, "0")}
                  detail="Same indicator in 2+ files"
                  icon="⌘"
                  color="teal"
                />

                <StatCard
                  label="Case Status"
                  value="Review"
                  detail={correlationResult ? "Correlation completed" : "Run evidence analysis"}
                  icon="!"
                  color="orange"
                />
              </section>

              <section className="content-grid">
                {/* EVIDENCE CONNECTIONS */}

                <div className="panel graph-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>How Evidence Connects</h3>
                      <p>
                        Example of how information from different files
                        could be linked.
                      </p>
                    </div>

                    <span className="pill pill-purple">
                      Sample
                    </span>
                  </div>

                  <div className="graph-canvas" style={{ padding: "20px", overflow: "auto", minHeight: "220px" }}>
                    {!correlationResult ? (
                      <div className="panel-footnote">Run Analyze Evidence to generate connections from your uploaded files.</div>
                    ) : correlationResult.matches.length === 0 ? (
                      <div className="panel-footnote">No shared indicators found yet. Upload and analyze at least two TXT files containing the same URL, IP address or email address.</div>
                    ) : (
                      <div style={{ display: "grid", gap: "12px" }}>
                        {correlationResult.matches.slice(0, 5).map((match, index) => (
                          <div key={`${match.indicator}-${index}`} style={{ border: "1px solid #e5e7eb", borderRadius: "12px", padding: "12px", background: "#fff" }}>
                            <strong style={{ display: "block", overflowWrap: "anywhere" }}>{match.indicator}</strong>
                            <small>Found in {match.evidenceCount} files</small>
                            <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                              {match.evidenceNames.map((name) => <span key={name} className="pill pill-purple">{name}</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="panel-footnote">
                    Shared values show a data match only. They do not prove that the files came from the same person or that an attack is confirmed.
                  </div>
                </div>

                {/* EVENT TIMELINE */}

                <div className="panel timeline-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Event Timeline</h3>
                      <p>Example sequence of investigation events.</p>
                    </div>

                    <button
                      className="text-button"
                      onClick={() => setActiveNav("Event Timeline")}
                    >
                      View All ↗
                    </button>
                  </div>

                  <div className="timeline">
                    {events.slice(0, 4).map((event, index) => (
                      <div
                        className="timeline-item"
                        key={`${event.time}-${index}`}
                      >
                        <div
                          className={`timeline-marker ${event.type}`}
                        />

                        <div className="timeline-copy">
                          <span className="event-time">
                            {event.time}
                          </span>

                          <strong>{event.title}</strong>

                          <small>{event.source}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* FILES AND WORKFLOW */}

              <section className="content-grid lower-grid">
                <div className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Uploaded Files</h3>
                      <p>Files available in this session.</p>
                    </div>

                    <button
                      className="text-button"
                      onClick={() => setActiveNav("Uploaded Files")}
                    >
                      View All ↗
                    </button>
                  </div>

                  <EvidenceTable evidence={evidence.slice(0, 4)} />
                </div>

                <div className="panel workflow-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>How It Works</h3>
                      <p>Five simple investigation steps.</p>
                    </div>
                  </div>

                  {[
                    ["01", "Upload Files", "Add messages, images or audio."],
                    ["02", "Read File Contents", "Extract text and useful details."],
                    ["03", "Find Matches", "Compare links and other indicators."],
                    ["04", "Connect the Events", "Build a timeline and evidence graph."],
                    ["05", "Create a Report", "Review the findings and evidence."],
                  ].map(([number, title, detail]) => (
                    <div className="workflow-step" key={number}>
                      <span>{number}</span>

                      <div>
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </div>
                    </div>
                  ))}

                  <div style={{ padding: "0 18px" }}>
                    <button
                      className="btn btn-primary full-button"
                      disabled={running}
                      onClick={runAnalysis}
                    >
                      {running ? "Analyzing..." : "▶ Analyze Evidence"}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* UPLOADED FILES */}

          {activeNav === "Uploaded Files" && (
            <section className="panel section-panel">
              <div className="panel-heading">
                <div>
                  <h3>Your Files</h3>
                  <p>Upload and view the files in your investigation.</p>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => fileRef.current?.click()}
                >
                  + Upload Files
                </button>
              </div>

              <div
                className="drop-zone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  addFiles(event.dataTransfer.files);
                }}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    fileRef.current?.click();
                  }
                }}
              >
                <span className="upload-symbol">↑</span>

                <strong>
                  Drop your files here or click to browse
                </strong>

                <p>
                  Images, audio, TXT, EML, CSV, PDF and JSON
                </p>

                <small>
                  Files are uploaded to the backend investigation. TXT files can currently be analyzed.
                </small>
              </div>

              <EvidenceTable evidence={evidence} onDelete={deleteEvidence} running={running} />

              <div style={{ padding: "18px" }}>
                <button
                  className="btn btn-primary"
                  disabled={running}
                  onClick={runAnalysis}
                >
                  {running ? "Analyzing..." : "Analyze Uploaded Files"}
                </button>
              </div>
            </section>
          )}

          {/* CHECK FOR THREATS */}

          {activeNav === "Check for Threats" && (
            <section className="panel section-panel">
              <div className="panel-heading">
                <div>
                  <h3>Suspicious Details</h3>
                  <p>
                    Examples of details that a connected analysis system
                    could check.
                  </p>
                </div>

                <span className="pill pill-orange">
                  Examples Only
                </span>
              </div>

              <div className="indicator-grid">
                {evidence.flatMap((file) => file.indicators.map((indicator) => ({ file: file.name, indicator }))).map((item, index) => (
                  <div className="indicator-card" key={`${item.file}-${item.indicator}-${index}`}>
                    <span className="indicator-type">INDICATOR</span>
                    <h4 style={{ overflowWrap: "anywhere" }}>{item.indicator}</h4>
                    <p>Found in {item.file}</p>
                    <small>Extracted from text; reputation not checked</small>
                  </div>
                ))}
                {evidence.every((file) => !file.indicators.length) && (
                  <div className="panel-footnote">No extracted indicators yet. Upload TXT evidence and click Analyze Evidence.</div>
                )}
              </div>
              <div className="panel-footnote">
                These are extracted indicators, not confirmed malicious findings. Website reputation checks are not implemented yet.
              </div>
            </section>
          )}

          {/* HOW EVIDENCE CONNECTS */}

          {activeNav === "How Evidence Connects" && (
            <section className="panel section-panel">
              <div className="panel-heading">
                <div>
                  <h3>Connections Between Files</h3>
                  <p>
                    See how a common detail might link different pieces
                    of evidence.
                  </p>
                </div>

                <span className="pill pill-purple">
                  Sample Graph
                </span>
              </div>

              <div className="large-graph" style={{ padding: 12 }}>
  <AttackGraph result={correlationResult} />
</div>
              <div className="panel-footnote">
                Connections are calculated from exact indicator matches in analyzed evidence. A match does not prove who sent the files or confirm malicious activity.
              </div>
            </section>
          )}

          {/* EVENT TIMELINE */}

          {activeNav === "Event Timeline" && (
            <section className="panel section-panel">
              <div className="panel-heading">
                <div>
                  <h3>Event Timeline</h3>
                  <p>
                    Events saved in the backend investigation.
                  </p>
                </div>
              </div>

              <div className="timeline full-timeline">
                {events.map((event, index) => (
                  <div
                    className="timeline-item"
                    key={`${event.time}-${index}`}
                  >
                    <div className={`timeline-marker ${event.type}`} />

                    <div className="timeline-copy">
                      <span className="event-time">{event.time}</span>
                      <strong>{event.title}</strong>
                      <small>{event.source}</small>
                    </div>
                  </div>
                ))}
              </div>

              <div className="panel-footnote">
                Timeline entries reflect recorded application events, not necessarily the original time a cyber incident occurred.
              </div>
            </section>
          )}

          {/* REPORTS */}

          {activeNav === "Reports" && (
            <section className="panel section-panel">
              <div className="panel-heading">
                <div>
                  <h3>Investigation Report</h3>
                  <p>
                    Download the current file list and event summary.
                  </p>
                </div>
              </div>

              <div className="report-summary">
                <span className="report-icon">▧</span>

                <div>
                  <h3>Investigation #001</h3>
                  <p>
                    Saved evidence inventory and the current correlation summary.
                  </p>
                  <small>JSON file · Backend investigation</small>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={downloadReport}
                >
                  ↓ Download Report
                </button>
              </div>

              <div className="panel-footnote">
                This export is a JSON summary, not a verified forensic report. Image OCR, audio transcription and malicious-link reputation checks are not implemented yet.
              </div>
            </section>
          )}

          {/* FOOTER */}

          <footer className="footer">
            <span>
              CyberChronicle <span className="footer-dot">•</span>{" "}
              NullPointer
            </span>

            <span>
              Prototype · TXT indicator extraction and exact-match correlation
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
