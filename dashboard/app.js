import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DATA_URL = "./data.json";
const POLL_MS = 30_000;
const COLORS = { monkeytype: "#edbe68", leetcode: "#65d6df", codechef: "#b2a2ff", github: "#6aa7ff" };
const state = { snapshot: null, scene: null, camera: null, renderer: null, controls: null, meshes: [], frame: 0, lastFetch: 0 };
const $ = (id) => document.getElementById(id);

function number(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-IN").format(Number(value));
}
function shortDate(value) {
  if (!value) return "No activity yet";
  const d = new Date(value + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}
function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, function(ch) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch];
  });
}
function activityLevel(count, max) {
  if (!count || count <= 0) return 0;
  const ratio = count / Math.max(1, max);
  return ratio < .25 ? 1 : ratio < .5 ? 2 : ratio < .75 ? 3 : 4;
}
function setConnection(ok, label, timestamp) {
  $("data-status").textContent = ok ? "CONNECTED" : "DATA DELAYED";
  $("data-status").style.color = ok ? "var(--mint)" : "var(--amber)";
  $("last-updated").textContent = timestamp ? "Snapshot: " + timestamp : label;
}
function renderOverview(platforms) {
  const active = platforms.reduce((sum, p) => sum + (Number(p.activeDays) || 0), 0);
  $("platform-count").textContent = String(platforms.length).padStart(2, "0");
  $("active-total").textContent = number(active);
  const latest = platforms.filter(p => p.lastActiveDate).sort((a,b) => b.lastActiveDate.localeCompare(a.lastActiveDate))[0];
  $("latest-activity").textContent = latest ? shortDate(latest.lastActiveDate) : "—";
  $("latest-platform").textContent = latest ? latest.label + " · " + latest.handle : "Waiting for activity";
  $("snapshot-date").textContent = "SNAPSHOT · " + (state.snapshot?.generatedAtIST ?? "—");
}
function renderPlatforms(platforms) {
  $("platform-grid").innerHTML = platforms.map(function(p) {
    const tint = COLORS[p.id] || "#6fe2b3";
    const metrics = (p.metrics || []).slice(0, 4).map(function(m) {
      return '<div><span class="metric-value">' + escapeText(m.value) + '</span><span class="metric-label">' + escapeText(m.label) + '</span></div>';
    }).join("");
    return '<article class="platform-card" style="--platform:' + tint + '">' +
      '<div class="platform-top"><div><div class="platform-name">' + escapeText(p.label) + '</div><div class="platform-handle">' + escapeText(p.handle) + '</div></div><span class="platform-status">' + escapeText(p.status || "PROFILE") + '</span></div>' +
      '<div class="streak-row"><div><span class="streak-number">' + number(p.currentStreak) + '<small>CURRENT STREAK · DAYS</small></span></div><div><span class="streak-number" style="color:' + tint + '">' + number(p.longestStreak) + '<small>LONGEST STREAK · DAYS</small></span></div></div>' +
      '<div class="platform-metrics">' + (metrics || '<div><span class="metric-value">—</span><span class="metric-label">METRICS NOT PUBLISHED</span></div>') + '</div>' +
      '<a class="platform-link" href="' + escapeText(p.url) + '" target="_blank" rel="noreferrer">OPEN ' + escapeText(p.label) + ' PROFILE ↗</a></article>';
  }).join("");
}
function renderHeatmaps(platforms) {
  $("heatmap-grid").innerHTML = platforms.map(function(p) {
    const days = p.dailyActivity || [];
    const counts = days.map(d => Number(d.count || 0));
    const max = Math.max(1, ...counts);
    const cells = days.map(function(d) {
      const count = Number(d.count || 0);
      return '<span class="heat-cell" data-level="' + activityLevel(count, max) + '" title="' + escapeText(d.date) + ' · ' + count + ' activity"></span>';
    }).join("");
    return '<article class="heatmap-card"><div class="heatmap-head"><strong>' + escapeText(p.label) + '</strong><span>' + (p.activityAvailable ? number(p.activeDays) + ' ACTIVE DAYS' : 'ACTIVITY PRIVATE') + '</span></div><div class="heatmap-cells">' + cells + '</div><div class="heatmap-meta"><span>' + (days.length ? shortDate(days[0].date) : "—") + '</span><span>LAST 91 DAYS</span><span>' + (days.length ? shortDate(days[days.length - 1].date) : "—") + '</span></div></article>';
  }).join("");
}
function updateDashboard(snapshot) {
  state.snapshot = snapshot;
  const platforms = snapshot.platforms || [];
  renderOverview(platforms);
  renderPlatforms(platforms);
  renderHeatmaps(platforms);
  setConnection(true, "Snapshot loaded", snapshot.generatedAtIST);
  if (state.scene) updateThreeData(platforms);
}
async function fetchSnapshot(manual) {
  const button = $("refresh-button");
  if (manual) { button.disabled = true; button.textContent = "Checking…"; }
  try {
    const response = await fetch(DATA_URL + "?v=" + Date.now(), { cache: "no-store", headers: { "cache-control": "no-cache" } });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const snapshot = await response.json();
    if (!snapshot.platforms || !Array.isArray(snapshot.platforms)) throw new Error("Snapshot shape is invalid");
    if (snapshot.generatedAt !== state.snapshot?.generatedAt) updateDashboard(snapshot);
    else setConnection(true, "No new source snapshot", snapshot.generatedAtIST);
    state.lastFetch = Date.now();
  } catch (error) {
    console.error("Dashboard snapshot check failed:", error);
    setConnection(false, "Could not reach the latest data snapshot.", state.snapshot?.generatedAtIST || "");
    if (!state.snapshot) $("platform-grid").innerHTML = '<div class="loading-card">No data snapshot is available yet. The collector workflow must complete its first run. (' + escapeText(error.message) + ')</div>';
  } finally {
    if (manual) { button.disabled = false; button.textContent = "↻ Check for updates"; }
  }
}
function startClock() {
  const tick = function() {
    $("clock").textContent = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()) + " IST";
  };
  tick();
  setInterval(tick, 1000);
}
function createThree() {
  const host = $("three-stage");
  if (!host || !("WebGLRenderingContext" in window)) { $("webgl-fallback").hidden = false; return; }
  try {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b100e");
    scene.fog = new THREE.Fog("#0b100e", 16, 38);
    const camera = new THREE.PerspectiveCamera(44, host.clientWidth / host.clientHeight, .1, 100);
    camera.position.set(10.5, 10.8, 14.5);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight("#d9f5e4", "#101914", 2.2));
    const key = new THREE.DirectionalLight("#b7ffda", 3.0); key.position.set(-4, 10, 7); scene.add(key);
    const fill = new THREE.PointLight("#4eaeff", 24, 28); fill.position.set(10, 4, -4); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshStandardMaterial({ color: "#101914", roughness: .92, metalness: .05 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(5.4, -.18, 2.4); scene.add(floor);
    const grid = new THREE.GridHelper(15, 30, "#31503e", "#1d3026"); grid.position.set(5.4, -.16, 2.4); scene.add(grid);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(5.4, .4, 2.4); controls.enableDamping = true; controls.dampingFactor = .075;
    controls.minDistance = 9; controls.maxDistance = 27; controls.maxPolarAngle = Math.PI * .48;
    controls.autoRotate = true; controls.autoRotateSpeed = .35;
    const starGeometry = new THREE.BufferGeometry(), starPositions = [];
    for (let i = 0; i < 220; i++) starPositions.push((Math.random() - .5) * 28, Math.random() * 7 + 1, (Math.random() - .5) * 20);
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: "#7dbb96", size: .035, transparent: true, opacity: .48 }));
    scene.add(stars);
    state.scene = scene; state.camera = camera; state.renderer = renderer; state.controls = controls;
    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    renderer.domElement.addEventListener("pointermove", function(event) {
      const box = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - box.left) / box.width) * 2 - 1;
      pointer.y = -((event.clientY - box.top) / box.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(state.meshes, false), card = $("hover-card");
      if (!hits.length || hits[0].instanceId === undefined) { card.hidden = true; return; }
      const hit = hits[0], info = hit.object.userData.items?.[hit.instanceId];
      if (!info) { card.hidden = true; return; }
      card.hidden = false;
      card.style.left = Math.min(event.clientX - box.left + 14, box.width - 205) + "px";
      card.style.top = Math.max(64, Math.min(event.clientY - box.top - 15, box.height - 98)) + "px";
      card.innerHTML = '<strong>' + escapeText(info.platform) + '</strong><span>' + escapeText(info.date) + '</span><span>' + number(info.count) + ' activity events</span>';
    });
    renderer.domElement.addEventListener("pointerleave", function() { $("hover-card").hidden = true; });
    const resize = function() {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    new ResizeObserver(resize).observe(host);
    const animate = function() {
      state.frame = requestAnimationFrame(animate);
      controls.update(); stars.rotation.y += .00015; renderer.render(scene, camera);
    };
    animate();
    $("reset-camera").addEventListener("click", function() {
      camera.position.set(10.5, 10.8, 14.5); controls.target.set(5.4, .4, 2.4); controls.update();
    });
    if (state.snapshot?.platforms) updateThreeData(state.snapshot.platforms);
  } catch (error) {
    console.error("Three.js could not initialize:", error);
    $("webgl-fallback").hidden = false;
  }
}
function updateThreeData(platforms) {
  if (!state.scene) return;
  for (const mesh of state.meshes) {
    state.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
  }
  state.meshes = [];
  const platformOrder = ["monkeytype", "leetcode", "codechef", "github"], xSpacing = .88, zSpacing = .43;
  platforms.forEach(function(platform) {
    if (platformOrder.indexOf(platform.id) < 0) return;
    const index = platformOrder.indexOf(platform.id), tint = new THREE.Color(COLORS[platform.id] || "#6fe2b3");
    const days = platform.dailyActivity || [], max = Math.max(1, ...days.map(day => Number(day.count || 0)));
    const geometry = new THREE.BoxGeometry(.53, 1, .31);
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .38, metalness: .24, emissive: tint, emissiveIntensity: .12 });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(days.length, 1));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    mesh.userData.items = [];
    days.forEach(function(day, i) {
      const count = Number(day.count || 0), height = count > 0 ? .24 + Math.sqrt(count / max) * 2.0 : .045;
      const x = Math.floor(i / 7) * xSpacing, z = index * 2.0 + (i % 7) * zSpacing;
      dummy.position.set(x, height / 2 - .12, z); dummy.scale.set(1, height, 1); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(tint).multiplyScalar(count > 0 ? .45 + .55 * Math.sqrt(count / max) : .12);
      mesh.setColorAt(i, color);
      mesh.userData.items[i] = { platform: platform.label, date: day.date, count: count };
    });
    mesh.count = days.length; mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    state.scene.add(mesh); state.meshes.push(mesh);
  });
}

$("refresh-button").addEventListener("click", function() { fetchSnapshot(true); });
startClock();
createThree();
fetchSnapshot(true);
setInterval(function() { fetchSnapshot(false); }, POLL_MS);
setInterval(function() {
  const remaining = Math.max(0, POLL_MS - (Date.now() - state.lastFetch));
  $("next-check").textContent = "00:" + String(Math.ceil(remaining / 1000)).padStart(2, "0");
}, 1000);
window.addEventListener("beforeunload", function() { cancelAnimationFrame(state.frame); });
