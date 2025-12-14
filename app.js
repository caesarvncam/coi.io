/* Magic Christmas v2
   - Gradient background + vignette (CSS)
   - Snow particle system (Three.js)
   - Glass UI
   - Giữ điều khiển MediaPipe (tay)
*/
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- UI ----------
  const btnStart = $("btnStart");
  const imgStatus = $("imgStatus");
  const errorLog = $("error-log");

  // ---------- Audio ----------
  const MUSIC_URL = "./audio.mp3";
  const bgMusic = new Audio(MUSIC_URL);
  bgMusic.loop = true;
  bgMusic.volume = 1.0;

  // ---------- State ----------
  let started = false;
  let state = "TREE";           // TREE | EXPLODE | PHOTO | HEART
  let selectedIndex = 0;
  let handX = 0.5;

  // ---------- Three.js ----------
  let scene, camera, renderer;
  let groupGold, groupRed, groupGift;
  let snowPoints = null;

  let photoMeshes = [];
  const photoTextures = new Array(5);

  const clock = new THREE.Clock();

  const CONFIG = {
    goldCount: 1800,
    redCount: 340,
    giftCount: 180,
    explodeRadius: 70,
    // Ảnh khi “xòe tay” (EXPLODE) sẽ bay vòng quanh và nhìn to hơn:
    // - tăng bán kính quỹ đạo một chút
    // - đẩy cả vòng ảnh tiến gần camera hơn (photoOrbitZ)
    photoOrbitRadius: 36,
    photoOrbitZ: 45,
    treeHeight: 70,
    treeBaseRadius: 34,
    snowCount: 1200,
    snowBox: 140
  };

  // ---------- Custom textures ----------
  function createCustomTexture(type) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const cx = 64, cy = 64;

    if (type === "gold_glow") {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 48);
      grd.addColorStop(0.00, "rgba(255,255,255,1)");
      grd.addColorStop(0.22, "rgba(255,245,200,1)");
      grd.addColorStop(0.55, "rgba(255,215,0,0.95)");
      grd.addColorStop(1.00, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
    }

    if (type === "red_light") {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 48);
      grd.addColorStop(0.00, "rgba(255,255,255,1)");
      grd.addColorStop(0.25, "rgba(255,160,160,0.95)");
      grd.addColorStop(0.60, "rgba(255,40,70,0.90)");
      grd.addColorStop(1.00, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
    }

    if (type === "gift_red") {
      // Simple "gift" sparkle sprite
      ctx.clearRect(0, 0, 128, 128);
      ctx.fillStyle = "rgba(255,255,255,0)";
      ctx.fillRect(0,0,128,128);

      ctx.save();
      ctx.translate(64,64);
      ctx.rotate(Math.PI/8);

      ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
      ctx.shadowBlur = 14;

      ctx.fillStyle = "rgba(255, 80, 110, 0.95)";
      ctx.fillRect(-18,-18,36,36);

      ctx.fillStyle = "rgba(255, 220, 90, 0.95)";
      ctx.fillRect(-4,-18,8,36);
      ctx.fillRect(-18,-4,36,8);

      ctx.restore();
    }

    if (type === "snow") {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
      grd.addColorStop(0.00, "rgba(255,255,255,1)");
      grd.addColorStop(0.28, "rgba(255,255,255,0.95)");
      grd.addColorStop(0.70, "rgba(255,255,255,0.25)");
      grd.addColorStop(1.00, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
    }

    return new THREE.CanvasTexture(canvas);
  }

  const textures = {
    gold: createCustomTexture("gold_glow"),
    red: createCustomTexture("red_light"),
    gift: createCustomTexture("gift_red"),
    snow: createCustomTexture("snow")
  };

  // Default photos in folder
  const defaultPhotoFiles = [
    "./image1.jpeg",
    "./image2.jpeg",
    "./image3.jpeg",
    "./image4.jpeg",
    "./image5.jpeg"
  ];


  // ---------- Error log ----------
  function showError(msg) {
    if (!errorLog) return;
    errorLog.style.display = "block";
    errorLog.textContent = String(msg || "Unknown error");
  }
  window.addEventListener("error", (e) => showError(e.error?.stack || e.message || e.type));

  // ---------- Photo loading ----------
  const loader = new THREE.TextureLoader();

  function applyTextureToMesh(i, tex) {
    const mesh = photoMeshes[i];
    if (!mesh) return;

    mesh.material.map = tex;
    mesh.material.needsUpdate = true;

    // Keep aspect ratio by scaling X
    const img = tex.image;
    if (img && img.width && img.height) {
      const aspect = img.width / img.height;
      mesh.userData.aspect = aspect;

      // Update frame behind
      if (mesh.userData.frame) {
        mesh.userData.frame.scale.set(aspect * 1.14, 1.14, 1);
      }
      if (mesh.userData.shadow) {
        mesh.userData.shadow.scale.set(aspect * 1.18, 1.18, 1);
      }
    }
  }

  function loadPhotoByUrl(i, url) {
    loader.load(
      url,
      (tex) => {
        // r128 uses encoding
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
        photoTextures[i] = tex;
        applyTextureToMesh(i, tex);
      },
      undefined,
      (err) => {
        console.warn("Load texture failed:", url, err);
      }
    );
  }

  function loadDefaultPhotos() {
    for (let i = 0; i < 5; i++) loadPhotoByUrl(i, defaultPhotoFiles[i]);
  }



  // ---------- Three scene ----------
  function init3D() {
    const container = $("canvas-container");
    if (!container) throw new Error("Missing #canvas-container");

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070b, 0.0022);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
    camera.position.set(0, 10, 110);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Particles for tree / explode
    groupGold = createParticleSystem("gold", CONFIG.goldCount, 2.2);
    groupRed = createParticleSystem("red", CONFIG.redCount, 3.8);
    groupGift = createParticleSystem("gift", CONFIG.giftCount, 3.2);

    // Photos
    createPhotos();
    // Decorations
    createDecorations();

    // Snow
    createSnow();

    // Load photos after renderer exists (anisotropy)
    loadDefaultPhotos();

    animate();
  }

  function createParticleSystem(type, count, size) {
    const pPositions = [];
    const pExplodeTargets = [];
    const pTreeTargets = [];
    const pHeartTargets = [];
    const sizes = [];
    const phases = [];

    for (let i = 0; i < count; i++) {
      // TREE: points inside cone
      const h = Math.random() * CONFIG.treeHeight;
      const y = h - CONFIG.treeHeight / 2;
      const maxR = (1 - (h / CONFIG.treeHeight)) * CONFIG.treeBaseRadius;
      const radiusRatio = (type === "gold") ? Math.sqrt(Math.random()) : (0.86 + Math.random() * 0.14);
      const r = maxR * radiusRatio;
      const theta = Math.random() * Math.PI * 2;
      pTreeTargets.push(r * Math.cos(theta), y, r * Math.sin(theta));

      // EXPLODE: sphere-ish
      const u = Math.random(), v = Math.random();
      const phi = Math.acos(2 * v - 1);
      const lam = 2 * Math.PI * u;
      const radMult = (type === "gift") ? 1.25 : 1.0;
      const rad = CONFIG.explodeRadius * Math.cbrt(Math.random()) * radMult;
      pExplodeTargets.push(
        rad * Math.sin(phi) * Math.cos(lam),
        rad * Math.sin(phi) * Math.sin(lam),
        rad * Math.cos(phi)
      );

      // HEART: soft fill
      const tHeart = Math.random() * Math.PI * 2;
      let hx = 16 * Math.pow(Math.sin(tHeart), 3);
      let hy = 13 * Math.cos(tHeart) - 5 * Math.cos(2 * tHeart) - 2 * Math.cos(3 * tHeart) - Math.cos(4 * tHeart);
      const rFill = Math.pow(Math.random(), 0.32);
      hx *= rFill; hy *= rFill;
      let hz = (Math.random() - 0.5) * 8 * rFill;

      const noise = 1.0;
      hx += (Math.random() - 0.5) * noise;
      hy += (Math.random() - 0.5) * noise;
      hz += (Math.random() - 0.5) * noise;

      const scaleH = 2.2;
      pHeartTargets.push(hx * scaleH, hy * scaleH + 6, hz);

      // INIT = tree
      pPositions.push(pTreeTargets[i * 3], pTreeTargets[i * 3 + 1], pTreeTargets[i * 3 + 2]);
      sizes.push(size);
      phases.push(Math.random() * Math.PI * 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pPositions, 3));
    geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    // Vertex colors
    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color();
    if (type === "gold") baseColor.setHex(0xffd36a);
    else if (type === "red") baseColor.setHex(0xff3b5c);
    else baseColor.setHex(0xffffff);

    for (let i = 0; i < count; i++) {
      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    geo.userData = {
      tree: pTreeTargets,
      explode: pExplodeTargets,
      heart: pHeartTargets,
      phases,
      baseColor,
      baseSize: size
    };

    const mat = new THREE.PointsMaterial({
      size,
      map: textures[type],
      transparent: true,
      opacity: (type === "gift") ? 0.95 : 1.0,
      vertexColors: true,
      blending: (type === "gift") ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);
    return points;
  }

  function createPhotos() {
    // unit planes; scale with aspect later
    const geo = new THREE.PlaneGeometry(1, 1);

    const frameGeo = new THREE.PlaneGeometry(1, 1);
    const frameMat = new THREE.MeshBasicMaterial({
      color: 0xffd36a,
      transparent: true,
      opacity: 0.95
    });

    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35
    });

    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: null,
        side: THREE.DoubleSide,
        transparent: true
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.scale.set(0, 0, 0);
      mesh.userData.aspect = 1;

      // shadow behind
      const sh = new THREE.Mesh(shadowGeo, shadowMat);
      sh.position.z = -0.06;
      sh.scale.set(1.18, 1.18, 1);
      mesh.add(sh);
      mesh.userData.shadow = sh;

      // gold frame behind
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.z = -0.03;
      frame.scale.set(1.14, 1.14, 1);
      mesh.add(frame);
      mesh.userData.frame = frame;

      scene.add(mesh);
      photoMeshes.push(mesh);
    }
  }

  // Decorations: Title, star and love
  let titleMesh, starMesh, loveMesh;

  function createDecorations() {
    // Title
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 256;
    const ctx = canvas.getContext("2d");

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '900 88px "Times New Roman", serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd36a";
    ctx.shadowColor = "rgba(255,60,110,0.85)";
    ctx.shadowBlur = 36;
    ctx.fillText("MERRY  CHRISTMAS", 512, 132);

    const tex = new THREE.CanvasTexture(canvas);
    tex.encoding = THREE.sRGBEncoding;

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(64, 16), mat);
    titleMesh.position.set(0, 52, 0);
    scene.add(titleMesh);

    // Star sprite
    const starCanvas = document.createElement("canvas");
    starCanvas.width = 128; starCanvas.height = 128;
    const sCtx = starCanvas.getContext("2d");

    sCtx.translate(64, 64);
    sCtx.fillStyle = "#ffd36a";
    sCtx.shadowColor = "rgba(255,255,255,0.9)";
    sCtx.shadowBlur = 22;

    sCtx.beginPath();
    const outer = 52, inner = 22;
    for (let i = 0; i < 5; i++) {
      sCtx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * outer, -Math.sin((18 + i * 72) / 180 * Math.PI) * outer);
      sCtx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * inner, -Math.sin((54 + i * 72) / 180 * Math.PI) * inner);
    }
    sCtx.closePath();
    sCtx.fill();

    const starTex = new THREE.CanvasTexture(starCanvas);
    starTex.encoding = THREE.sRGBEncoding;

    const starMat = new THREE.MeshBasicMaterial({
      map: starTex,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    starMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), starMat);
    starMesh.position.set(0, CONFIG.treeHeight / 2 + 5, 0);
    scene.add(starMesh);

    // Love text
    const loveCanvas = document.createElement("canvas");
    loveCanvas.width = 1024; loveCanvas.height = 256;
    const lCtx = loveCanvas.getContext("2d");

    lCtx.font = '900 110px "Segoe UI", sans-serif';
    lCtx.textAlign = "center";
    lCtx.fillStyle = "#ff6ad6";
    lCtx.shadowColor = "rgba(255, 20, 147, 0.85)";
    lCtx.shadowBlur = 40;
    lCtx.fillText("I LOVE YOU ❤️", 512, 138);

    const loveTex = new THREE.CanvasTexture(loveCanvas);
    loveTex.encoding = THREE.sRGBEncoding;

    const loveMat = new THREE.MeshBasicMaterial({
      map: loveTex,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    loveMesh = new THREE.Mesh(new THREE.PlaneGeometry(72, 18), loveMat);
    loveMesh.position.set(0, 0, 22);
    loveMesh.visible = false;
    scene.add(loveMesh);
  }

  // ---------- Snow ----------
  function createSnow() {
    const count = CONFIG.snowCount;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const drift = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * CONFIG.snowBox;
      const y = (Math.random() - 0.2) * CONFIG.snowBox + 60;
      const z = (Math.random() - 0.5) * CONFIG.snowBox;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      velocities[i] = 8 + Math.random() * 18;   // falling speed
      drift[i] = (Math.random() - 0.5) * 0.8;   // sideways drift
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.userData.velocities = velocities;
    geo.userData.drift = drift;

    const mat = new THREE.PointsMaterial({
      size: 2.0,
      map: textures.snow,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    snowPoints = new THREE.Points(geo, mat);
    snowPoints.position.set(0, 0, 0);
    scene.add(snowPoints);
  }

  function updateSnow(time, dt) {
    if (!snowPoints) return;

    const pos = snowPoints.geometry.attributes.position.array;
    const v = snowPoints.geometry.userData.velocities;
    const d = snowPoints.geometry.userData.drift;

    for (let i = 0; i < v.length; i++) {
      const idx = i * 3;
      pos[idx + 1] -= v[i] * dt;
      pos[idx] += Math.sin(time * 0.6 + i) * 0.012 + d[i] * dt;
      pos[idx + 2] += Math.cos(time * 0.45 + i) * 0.010;

      // wrap
      if (pos[idx + 1] < -55) {
        pos[idx + 1] = 90 + Math.random() * 30;
        pos[idx] = (Math.random() - 0.5) * CONFIG.snowBox;
        pos[idx + 2] = (Math.random() - 0.5) * CONFIG.snowBox;
      }
    }

    snowPoints.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- Particle updates ----------
  function updateParticleGroup(group, type, targetState, speed, handRotY, time) {
    const positions = group.geometry.attributes.position.array;
    const sizes = group.geometry.attributes.size.array;
    const colors = group.geometry.attributes.color.array;

    const phases = group.geometry.userData.phases;
    const baseColor = group.geometry.userData.baseColor;
    const baseSize = group.geometry.userData.baseSize;

    const key = (targetState === "TREE") ? "tree" : (targetState === "HEART" ? "heart" : "explode");
    const targets = group.geometry.userData[(targetState === "PHOTO") ? "explode" : key];

    // Smooth interpolate to target
    for (let i = 0; i < positions.length; i++) {
      positions[i] += (targets[i] - positions[i]) * speed;
    }
    group.geometry.attributes.position.needsUpdate = true;

    const count = sizes.length;

    if (targetState === "TREE") {
      group.rotation.y += 0.003 + handRotY * 0.02;
      group.scale.set(1, 1, 1);

      for (let i = 0; i < count; i++) {
        sizes[i] = baseSize * (0.85 + 0.25 * Math.sin(time * 10 + phases[i]));
        let brightness = 1.0;

        if (type === "gold") brightness = 0.85 + 0.45 * Math.sin(time * 12 + phases[i]);
        if (type === "red") brightness = 0.60 + 0.55 * Math.sin(time * 3 + phases[i]);

        colors[i * 3] = baseColor.r * brightness;
        colors[i * 3 + 1] = baseColor.g * brightness;
        colors[i * 3 + 2] = baseColor.b * brightness;
      }
      group.geometry.attributes.size.needsUpdate = true;
      group.geometry.attributes.color.needsUpdate = true;
      return;
    }

    if (targetState === "HEART") {
      group.rotation.y = 0;
      const beat = 1 + Math.abs(Math.sin(time * 3)) * 0.16;
      group.scale.set(beat, beat, beat);

      for (let i = 0; i < count; i++) {
        colors[i * 3] = baseColor.r;
        colors[i * 3 + 1] = baseColor.g;
        colors[i * 3 + 2] = baseColor.b;

        // dotted look
        sizes[i] = (i % 3 === 0) ? baseSize : 0;
      }
      group.geometry.attributes.size.needsUpdate = true;
      group.geometry.attributes.color.needsUpdate = true;
      return;
    }

    // EXPLODE / PHOTO
    group.rotation.y += 0.006;
    group.scale.set(1, 1, 1);

    for (let i = 0; i < count; i++) {
      sizes[i] = baseSize * (0.9 + 0.25 * Math.sin(time * 7 + phases[i]));
      const brightness = 0.85 + 0.5 * Math.sin(time * 9 + phases[i]);
      colors[i * 3] = baseColor.r * brightness;
      colors[i * 3 + 1] = baseColor.g * brightness;
      colors[i * 3 + 2] = baseColor.b * brightness;
    }
    group.geometry.attributes.size.needsUpdate = true;
    group.geometry.attributes.color.needsUpdate = true;
  }

  // ---------- Main animation ----------
  function animate() {
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;
    const dt = Math.min(clock.getDelta(), 0.033);

    // Slight camera breathing (subtle)
    camera.position.x = Math.sin(time * 0.18) * 4;
    camera.position.y = 10 + Math.sin(time * 0.12) * 1.2;
    camera.lookAt(0, 0, 0);

    const speed = 0.08;
    const handRotY = (handX - 0.5) * 4.0;

    updateParticleGroup(groupGold, "gold", state, speed, handRotY, time);
    updateParticleGroup(groupRed, "red", state, speed, handRotY, time);
    updateParticleGroup(groupGift, "gift", state, speed, handRotY, time);

    updateSnow(time, dt);

    // Decorations visibility + motion
    if (titleMesh) {
      titleMesh.visible = (state === "TREE");
      titleMesh.position.y = 52 + Math.sin(time * 0.8) * 1.0;
      titleMesh.material.opacity = 0.86 + 0.12 * Math.sin(time * 2.0);
    }
    if (starMesh) {
      starMesh.visible = (state === "TREE");
      starMesh.rotation.z = time * 0.6;
      const s = 1 + 0.08 * Math.sin(time * 5);
      starMesh.scale.set(s, s, 1);
    }
    if (loveMesh) {
      loveMesh.visible = (state === "HEART");
      if (loveMesh.visible) {
        const s = 1 + Math.abs(Math.sin(time * 3)) * 0.10;
        loveMesh.scale.set(s, s, 1);
      }
    }

    // Photos
    if (state === "HEART") {
      photoMeshes.forEach((m) => { m.visible = false; });
    } else if (state === "TREE") {
      photoMeshes.forEach((m) => { m.visible = false; m.scale.lerp(new THREE.Vector3(0,0,0), 0.08); });
    } else if (state === "EXPLODE") {
      const baseAngle = groupGold.rotation.y;
      const step = (Math.PI * 2) / 5;

      let bestIdx = 0;
      let maxZ = -999;

      for (let i = 0; i < photoMeshes.length; i++) {
        const mesh = photoMeshes[i];
        mesh.visible = true;

        const angle = baseAngle + i * step;
        const x = Math.sin(angle) * CONFIG.photoOrbitRadius;
        // Đẩy vòng ảnh tiến gần camera để nhìn rõ hơn khi “xòe tay”
        const z = Math.cos(angle) * CONFIG.photoOrbitRadius + (CONFIG.photoOrbitZ || 0);
        const y = Math.sin(time + i) * 3.6;

        mesh.position.lerp(new THREE.Vector3(x, y, z), 0.12);
        mesh.lookAt(camera.position);
        mesh.rotation.z = Math.sin(time * 0.7 + i) * 0.06;

        const aspect = mesh.userData.aspect || 1;

        if (z > maxZ) { maxZ = z; bestIdx = i; }

        // Scale theo độ gần (z) để ảnh phía trước luôn to, dễ nhìn
        const zMin = (CONFIG.photoOrbitZ || 0) - CONFIG.photoOrbitRadius;
        const t = THREE.MathUtils.clamp((z - zMin) / (2 * CONFIG.photoOrbitRadius), 0, 1);
        const ds = 1.4 + t * 3.2; // ~1.4..4.6
        mesh.scale.lerp(new THREE.Vector3(ds * aspect, ds, ds), 0.12);
      }

      selectedIndex = bestIdx;
    } else if (state === "PHOTO") {
      for (let i = 0; i < photoMeshes.length; i++) {
        const mesh = photoMeshes[i];
        const aspect = mesh.userData.aspect || 1;
        mesh.visible = true;

        if (i === selectedIndex) {
          mesh.position.lerp(new THREE.Vector3(0, 0, 85), 0.12);
          mesh.scale.lerp(new THREE.Vector3(8.5 * aspect, 8.5, 8.5), 0.12);
          mesh.lookAt(camera.position);
          mesh.rotation.z = 0;
        } else {
          mesh.scale.lerp(new THREE.Vector3(0, 0, 0), 0.12);
        }
      }
    }

    renderer.render(scene, camera);
  }

  // ---------- MediaPipe hands ----------
  async function initHands() {
    const video = document.getElementsByClassName("input_video")[0];
    const canvas = $("camera-preview");
    const ctx = canvas.getContext("2d");

    const hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
      try {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (results.image) ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

        const lms = results.multiHandLandmarks || [];

        // Two hands -> HEART if index + thumb close
        if (lms.length === 2) {
          const h1 = lms[0], h2 = lms[1];
          const distIndex = Math.hypot(h1[8].x - h2[8].x, h1[8].y - h2[8].y);
          const distThumb = Math.hypot(h1[4].x - h2[4].x, h1[4].y - h2[4].y);
          if (distIndex < 0.15 && distThumb < 0.15) {
            state = "HEART";
            return;
          }
        }

        if (lms.length > 0) {
          const lm = lms[0];
          handX = lm[9].x;

          // Fist vs Open: average distance from fingertips to wrist
          const tips = [8, 12, 16, 20];
          const wrist = lm[0];

          let openDist = 0;
          for (const idx of tips) openDist += Math.hypot(lm[idx].x - wrist.x, lm[idx].y - wrist.y);
          const avgDist = openDist / tips.length;

          // Pinch -> PHOTO
          const pinchDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);

          if (avgDist < 0.25) state = "TREE";
          else if (pinchDist < 0.05) state = "PHOTO";
          else state = "EXPLODE";
        } else {
          state = "TREE";
        }
      } catch (err) {
        console.warn(err);
      }
    });

    // Request camera
    const mpCamera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 320,
      height: 240
    });

    mpCamera.start();
  }  // ---------- UI handlers ----------
  async function startSystem() {
    if (started) return;
    started = true;

    // UI
    btnStart.style.display = "none";
    if (imgStatus) imgStatus.textContent = "Đang khởi động… Hãy cho phép Camera nếu được hỏi.";

    // Audio (must be triggered by user gesture)
    bgMusic.play().catch(() => { /* ignore */ });

    // 3D
    init3D();

    // Hands
    try {
      await initHands();
      if (imgStatus) imgStatus.textContent = "Sẵn sàng ✨ Mở tay để nổ, chụm ngón để xem ảnh.";
    } catch (e) {
      if (imgStatus) imgStatus.textContent = "Không mở được Camera. Bạn vẫn có thể xem hiệu ứng 3D.";
      console.warn(e);
    }
  }

  // ---------- Events ----------
  window.addEventListener("resize", () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.addEventListener("DOMContentLoaded", () => {
    btnStart.addEventListener("click", startSystem);
  });
})();