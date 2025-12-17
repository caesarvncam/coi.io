(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- UI ----------
  const btnStart = $("btnStart");
  const wishLine = $("wishLine");
  const imgStatus = $("imgStatus");
  const errorLog = $("error-log");
  const memeLayer = $("meme-layer");

  // ---------- Recipient ----------
  const FRIEND_NAME = "Lê Anh Tuấn";

  // ---------- Audio ----------
  const MUSIC_URL = "./audio.mp3";
  const bgMusic = new Audio(MUSIC_URL);
  bgMusic.loop = true;
  bgMusic.volume = 1.0;

  // ---------- State ----------
  let started = false;
  let state = "TREE"; // TREE | EXPLODE | PHOTO | HEART (HEART is CAKE)
  let selectedIndex = 0;
  let handX = 0.5;
  let orbitOffsetX = 0;

  // ---------- Meme gating (only when user is inactive AND in hat state) ----------
  let lastHandSeenAt = performance.now();
  const INACTIVE_MS = 1600; // time with no hands to consider "not interacting"

  function shouldRunMemes() {
    const now = performance.now();
    const inactive = (now - lastHandSeenAt) > INACTIVE_MS;
    return inactive && state === "TREE";
  }

  // ---------- Bựa wishes ----------
  const WISHES = [
    "Tuổi mới: bớt lười 1% thôi cũng được, còn lại để năm sau.",
    "Chúc mừng sinh nhật! Chúc bạn ăn bánh không tăng cân (khoa học: ❌).",
    "Chúc bạn giàu lên để khỏi phải ‘ngắm giá’ rồi thở dài.",
    "Tuổi mới rực rỡ như confetti, nhưng đừng rơi vào mắt.",
    "Hôm nay bạn là nhân vật chính. Mai lại là NPC bình thường thôi 😌.",
    "Chúc bạn vui như trúng thưởng, ngủ ngon như… chưa từng deadline.",
    "Chúc bạn kiếm nhiều tiền, để cuối tháng đỡ ‘nghe gió thổi’ trong ví."
  ];
  let wishIndex = 0;

  function setWishText(text) {
    if (wishLine) wishLine.innerHTML = `🎉 Chúc mừng sinh nhật, <b>${FRIEND_NAME}</b>! ${escapeHtml(text)}`;
    updateTitleTexture(text);
    updateCakeTextTexture(text);
  }

  function nextWish() {
    wishIndex = (wishIndex + 1) % WISHES.length;
    setWishText(WISHES[wishIndex]);
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- Error log ----------
  function showError(msg) {
    if (!errorLog) return;
    errorLog.style.display = "block";
    errorLog.textContent = String(msg || "Unknown error");
  }
  window.addEventListener("error", (e) => showError(e.error?.stack || e.message || e.type));

  // ---------- Meme spam ----------
  const MEMES = [
    `🚨 ${FRIEND_NAME} đang nhận chúc mừng sinh nhật! 🚨`,
    `🎂 Bánh đâu? Ai ăn mất? (${FRIEND_NAME} nhìn không chớp mắt)`,
    `📢 Thông báo: ${FRIEND_NAME} đã lên level! (skill: ngủ nướng +10)`,
    `🧠 Não: "hôm nay chill" | Deadline: "xin chào"`,
    `💸 Ví: "không có tiền" | Tim: "vẫn vui"`,
    `👀 Ai đó nói “đi ngủ sớm” rồi lại xem thêm 1 tập…`,
    `🧨 Confetti nổ! Nếu rơi vào mắt: đừng kiện 😭`,
    `🫶 Giơ tim lên! Bánh sinh nhật sẽ xuất hiện như ma thuật…`,
    `😈 ${FRIEND_NAME}, hôm nay bạn được phép bựa hợp pháp!`,
    `🍰 Ăn bánh xong nhớ… để dành phần cho người đẹp trai nhất phòng`
  ];

  function spawnMeme() {
    if (!shouldRunMemes()) return;
    if (!memeLayer) return;

    const el = document.createElement("div");
    el.className = "meme-run";

    const text = MEMES[Math.floor(Math.random() * MEMES.length)];
    el.textContent = text;

    const y = 10 + Math.random() * 65;           // %
    const font = 12 + Math.random() * 18;        // px
    const dur = 7 + Math.random() * 10;          // seconds
    const opacity = 0.55 + Math.random() * 0.40;

    el.style.top = `${y}vh`;
    el.style.fontSize = `${font}px`;
    el.style.animationDuration = `${dur}s`;
    el.style.opacity = `${opacity}`;

    // slightly vary border glow via CSS filter intensity
    el.style.filter = `drop-shadow(0 10px 22px rgba(255,79,216,${0.10 + Math.random() * 0.25}))`;

    memeLayer.appendChild(el);

    // cleanup
    const cleanup = () => el.remove();
    el.addEventListener("animationend", cleanup, { once: true });

    // safety cleanup in case animationend doesn't fire
    setTimeout(cleanup, (dur + 2) * 1000);
  }

  let memeTimer = null;
  function startMemeSpam() {
    // Only spawns when shouldRunMemes() is true
    memeTimer = setInterval(() => {
      if (!shouldRunMemes()) return;

      // burst sometimes
      const burst = Math.random() < 0.25 ? 3 : 1;
      for (let i = 0; i < burst; i++) setTimeout(spawnMeme, i * 260);
    }, 1800);
  }


  // ---------- Three.js ----------
  let scene, camera, renderer;
  let groupGold, groupRed, groupGift;
  let confettiPoints = null;

  let photoMeshes = [];
  const photoTextures = new Array(5);

  const clock = new THREE.Clock();

  const CONFIG = {
    goldCount: 1800,
    redCount: 520,
    giftCount: 220,
    explodeRadius: 72,

    photoOrbitRadius: 36,
    photoOrbitZ: 45,
    photoOrbitY: 8,
    photoViewY: 8,
    photoFollowRange: 34,
    photoFollowSmoothing: 0.12,

    // Camera beauty filter: trắng sáng + tone hồng nhẹ
    cameraFilter: "brightness(1.22) contrast(1.08) saturate(1.18) hue-rotate(-8deg)",
    cameraTint: "rgba(255,105,180,0.14)",
    cameraTint2: "rgba(180,220,255,0.03)",
    cameraVignette: 0.12,

    // Party hat
    hatHeight: 76,
    hatBaseRadius: 34,

    // Confetti
    confettiCount: 1400,
    confettiBox: 160
  };

  // Cake params (used both for particle target + flame placement)
  const CAKE = {
    y0: 10,          // pushed up on Y
    baseR: 26,
    baseH: 22,
    topR: 18,
    topH: 14,
    candleCount: 5,
    candleR: 1.3,
    candleH: 16,
    candleRing: 10
  };

  // ---------- Custom textures ----------
  function createCustomTexture(type) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    const cx = 64, cy = 64;

    if (type === "gold_glow") {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 52);
      grd.addColorStop(0.00, "rgba(255,255,255,1)");
      grd.addColorStop(0.18, "rgba(255,248,220,1)");
      grd.addColorStop(0.55, "rgba(255,232,106,0.95)");
      grd.addColorStop(1.00, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
    }

    if (type === "red_light") {
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, 52);
      grd.addColorStop(0.00, "rgba(255,255,255,1)");
      grd.addColorStop(0.25, "rgba(255,200,245,0.95)");
      grd.addColorStop(0.62, "rgba(255,79,216,0.90)");
      grd.addColorStop(1.00, "rgba(0,0,0,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 128, 128);
    }

    if (type === "gift_red") {
      ctx.clearRect(0, 0, 128, 128);
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate(Math.PI / 9);

      ctx.shadowColor = "rgba(255, 255, 255, 0.85)";
      ctx.shadowBlur = 16;

      ctx.fillStyle = "rgba(106, 241, 255, 0.95)";
      ctx.fillRect(-18, -18, 36, 36);

      ctx.fillStyle = "rgba(255, 79, 216, 0.95)";
      ctx.fillRect(-6, -18, 12, 36);

      ctx.fillStyle = "rgba(255, 232, 106, 0.95)";
      ctx.fillRect(-18, -6, 36, 12);

      ctx.restore();
    }

    if (type === "confetti") {
      ctx.clearRect(0, 0, 128, 128);
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate(Math.PI / 7);

      ctx.shadowColor = "rgba(255,255,255,0.55)";
      ctx.shadowBlur = 10;

      ctx.fillStyle = "rgba(255, 232, 106, 0.95)";
      ctx.fillRect(-30, -10, 60, 20);

      ctx.fillStyle = "rgba(255, 79, 216, 0.92)";
      ctx.fillRect(-30, -10, 30, 20);

      ctx.restore();
    }

    if (type === "flame") {
      ctx.clearRect(0, 0, 128, 128);
      ctx.save();
      ctx.translate(64, 80);

      ctx.beginPath();
      ctx.moveTo(0, -66);
      ctx.bezierCurveTo(30, -30, 26, 0, 0, 20);
      ctx.bezierCurveTo(-26, 0, -30, -30, 0, -66);
      ctx.closePath();

      const g1 = ctx.createRadialGradient(0, -20, 8, 0, -10, 70);
      g1.addColorStop(0, "rgba(255,255,255,1)");
      g1.addColorStop(0.20, "rgba(255,250,210,1)");
      g1.addColorStop(0.55, "rgba(255,170,40,0.95)");
      g1.addColorStop(1, "rgba(255,60,0,0)");
      ctx.fillStyle = g1;

      ctx.shadowColor = "rgba(255,180,60,0.95)";
      ctx.shadowBlur = 22;
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.bezierCurveTo(14, -26, 12, -6, 0, 8);
      ctx.bezierCurveTo(-12, -6, -14, -26, 0, -46);
      ctx.closePath();
      const g2 = ctx.createRadialGradient(0, -18, 6, 0, -8, 40);
      g2.addColorStop(0, "rgba(255,255,255,1)");
      g2.addColorStop(0.5, "rgba(255,232,106,0.95)");
      g2.addColorStop(1, "rgba(255,232,106,0)");
      ctx.fillStyle = g2;
      ctx.fill();

      ctx.restore();
    }

    return new THREE.CanvasTexture(canvas);
  }

  const textures = {
    gold: createCustomTexture("gold_glow"),
    red: createCustomTexture("red_light"),
    gift: createCustomTexture("gift_red"),
    confetti: createCustomTexture("confetti"),
    flame: createCustomTexture("flame")
  };

  // Default photos in folder
  const defaultPhotoFiles = ["./image1.jpeg", "./image2.jpeg", "./image3.jpeg", "./image4.jpeg", "./image5.jpeg"];
  const loader = new THREE.TextureLoader();

  function applyTextureToMesh(i, tex) {
    const mesh = photoMeshes[i];
    if (!mesh) return;

    mesh.material.map = tex;
    mesh.material.needsUpdate = true;

    const img = tex.image;
    if (img && img.width && img.height) {
      const aspect = img.width / img.height;
      mesh.userData.aspect = aspect;

      if (mesh.userData.frame) mesh.userData.frame.scale.set(aspect * 1.14, 1.14, 1);
      if (mesh.userData.shadow) mesh.userData.shadow.scale.set(aspect * 1.18, 1.18, 1);
    }
  }

  function loadPhotoByUrl(i, url) {
    loader.load(
      url,
      (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
        photoTextures[i] = tex;
        applyTextureToMesh(i, tex);
      },
      undefined,
      (err) => console.warn("Load texture failed:", url, err)
    );
  }

  function loadDefaultPhotos() {
    for (let i = 0; i < 5; i++) loadPhotoByUrl(i, defaultPhotoFiles[i]);
  }

  // ---------- Title & Cake text textures ----------
  let titleMesh, titleCanvas, titleCtx, titleTex;
  let cakeTextMesh, cakeCanvas, cakeCtx, cakeTex;

  function updateTitleTexture(line3) {
    if (!titleCanvas || !titleCtx || !titleTex) return;

    titleCtx.clearRect(0, 0, titleCanvas.width, titleCanvas.height);

    titleCtx.font = '900 86px "Segoe UI", system-ui, sans-serif';
    titleCtx.textAlign = "center";
    titleCtx.fillStyle = "#ffe86a";
    titleCtx.shadowColor = "rgba(255,79,216,0.85)";
    titleCtx.shadowBlur = 34;
    titleCtx.fillText("HAPPY BIRTHDAY", 512, 112);

    titleCtx.shadowBlur = 22;
    titleCtx.fillStyle = "#6af1ff";
    titleCtx.font = '900 56px "Segoe UI", system-ui, sans-serif';
    titleCtx.fillText(FRIEND_NAME.toUpperCase(), 512, 186);

    titleCtx.shadowBlur = 18;
    titleCtx.fillStyle = "rgba(255,255,255,0.92)";
    titleCtx.font = '700 34px "Segoe UI", system-ui, sans-serif';
    const short = (line3 && line3.length > 44) ? (line3.slice(0, 44) + "…") : (line3 || "");
    titleCtx.fillText(short, 512, 236);

    titleTex.needsUpdate = true;
  }

  function updateCakeTextTexture(line) {
    if (!cakeCanvas || !cakeCtx || !cakeTex) return;

    cakeCtx.clearRect(0, 0, cakeCanvas.width, cakeCanvas.height);
    cakeCtx.textAlign = "center";

    cakeCtx.font = '900 86px "Segoe UI", system-ui, sans-serif';
    cakeCtx.fillStyle = "#ffe86a";
    cakeCtx.shadowColor = "rgba(255,79,216,0.70)";
    cakeCtx.shadowBlur = 32;
    cakeCtx.fillText(FRIEND_NAME, 512, 112);

    cakeCtx.shadowBlur = 18;
    cakeCtx.fillStyle = "rgba(255,255,255,0.92)";
    cakeCtx.font = '700 34px "Segoe UI", system-ui, sans-serif';
    const short = (line && line.length > 54) ? (line.slice(0, 54) + "…") : (line || "");
    cakeCtx.fillText(short, 512, 176);

    cakeCtx.shadowBlur = 0;
    cakeCtx.fillStyle = "rgba(255,255,255,0.70)";
    cakeCtx.font = '700 24px "Segoe UI", system-ui, sans-serif';
    cakeCtx.fillText("🫶 = bánh | giữ tay để xem nến cháy", 512, 222);

    cakeTex.needsUpdate = true;
  }

  // ---------- Three scene ----------
  function init3D() {
    const container = $("canvas-container");
    if (!container) throw new Error("Missing #canvas-container");

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070b, 0.0020);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
    camera.position.set(0, 10, 110);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    groupGold = createParticleSystem("gold", 1800, 2.2);
    groupRed = createParticleSystem("red", 520, 3.4);
    groupGift = createParticleSystem("gift", 220, 3.0);

    createPhotos();
    createDecorations();
    createConfetti();

    loadDefaultPhotos();
    animate();
  }

  function createParticleSystem(type, count, size) {
    const pPositions = [];
    const pExplodeTargets = [];
    const pTreeTargets = [];
    const pCakeTargets = [];
    const sizes = [];
    const phases = [];

    for (let i = 0; i < count; i++) {
      // TREE (Party Hat): points in cone
      const h = Math.random() * CONFIG.hatHeight;
      const y = h - CONFIG.hatHeight / 2;
      const maxR = (1 - (h / CONFIG.hatHeight)) * CONFIG.hatBaseRadius;
      const radiusRatio = (type === "gold") ? Math.sqrt(Math.random()) : (0.82 + Math.random() * 0.18);
      const r = maxR * radiusRatio;
      const theta = Math.random() * Math.PI * 2 + h * 0.09; // twist
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

      // HEART => CAKE (bánh sinh nhật bằng hạt)
      const t = Math.random();
      let x, yy, z;

      if (t < 0.70) {
        const rr = CAKE.baseR * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        x = rr * Math.cos(a);
        z = rr * Math.sin(a);
        yy = CAKE.y0 - CAKE.baseH / 2 + Math.random() * CAKE.baseH;
      } else if (t < 0.90) {
        const rr = CAKE.topR * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        x = rr * Math.cos(a);
        z = rr * Math.sin(a);
        yy = CAKE.y0 + CAKE.baseH / 2 + Math.random() * CAKE.topH;
      } else {
        const c = Math.floor(Math.random() * CAKE.candleCount);
        const baseAngle = (c / CAKE.candleCount) * Math.PI * 2 + 0.35;
        const cx = Math.cos(baseAngle) * CAKE.candleRing;
        const cz = Math.sin(baseAngle) * CAKE.candleRing;

        const rr = CAKE.candleR * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        x = cx + rr * Math.cos(a);
        z = cz + rr * Math.sin(a);
        yy = CAKE.y0 + CAKE.baseH / 2 + CAKE.topH + Math.random() * CAKE.candleH;
      }

      const noise = 0.9;
      x += (Math.random() - 0.5) * noise;
      yy += (Math.random() - 0.5) * noise;
      z += (Math.random() - 0.5) * noise;

      const sCake = (type === "gift") ? 1.03 : 1.0;
      pCakeTargets.push(x * sCake, yy, z * sCake);

      // INIT = tree
      pPositions.push(pTreeTargets[i * 3], pTreeTargets[i * 3 + 1], pTreeTargets[i * 3 + 2]);
      sizes.push(size);
      phases.push(Math.random() * Math.PI * 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pPositions, 3));
    geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    const colors = new Float32Array(count * 3);
    const baseColor = new THREE.Color();
    if (type === "gold") baseColor.setHex(0xffe86a);
    else if (type === "red") baseColor.setHex(0xff4fd8);
    else baseColor.setHex(0x6af1ff);

    for (let i = 0; i < count; i++) {
      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    geo.userData = {
      tree: pTreeTargets,
      explode: pExplodeTargets,
      heart: pCakeTargets, // keep key "heart" but content is CAKE target
      phases,
      baseColor,
      baseSize: size
    };

    const mat = new THREE.PointsMaterial({
      size,
      map: (type === "gift") ? createCustomTexture("gift_red") : (type === "red") ? createCustomTexture("red_light") : createCustomTexture("gold_glow"),
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
    const geo = new THREE.PlaneGeometry(1, 1);

    const frameGeo = new THREE.PlaneGeometry(1, 1);
    const frameMat = new THREE.MeshBasicMaterial({
      color: 0xffe86a,
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

      const sh = new THREE.Mesh(shadowGeo, shadowMat);
      sh.position.z = -0.06;
      sh.scale.set(1.18, 1.18, 1);
      mesh.add(sh);
      mesh.userData.shadow = sh;

      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.z = -0.03;
      frame.scale.set(1.14, 1.14, 1);
      mesh.add(frame);
      mesh.userData.frame = frame;

      scene.add(mesh);
      photoMeshes.push(mesh);
    }
  }

  // Decorations: Title + Cake text + flames
  let balloonMesh;
  let flameMeshes = [];

  function createDecorations() {
    // Title
    titleCanvas = document.createElement("canvas");
    titleCanvas.width = 1024; titleCanvas.height = 256;
    titleCtx = titleCanvas.getContext("2d");
    titleTex = new THREE.CanvasTexture(titleCanvas);
    titleTex.encoding = THREE.sRGBEncoding;

    const titleMat = new THREE.MeshBasicMaterial({
      map: titleTex,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    titleMesh = new THREE.Mesh(new THREE.PlaneGeometry(78, 20), titleMat);
    titleMesh.position.set(0, 52, 0);
    scene.add(titleMesh);

    // Balloon sprite
    const bCanvas = document.createElement("canvas");
    bCanvas.width = 128; bCanvas.height = 128;
    const bCtx = bCanvas.getContext("2d");
    bCtx.translate(64, 60);

    bCtx.beginPath();
    bCtx.ellipse(0, 0, 30, 38, 0, 0, Math.PI * 2);
    bCtx.closePath();
    const g = bCtx.createRadialGradient(-10, -10, 2, 0, 0, 60);
    g.addColorStop(0, "rgba(255,255,255,0.95)");
    g.addColorStop(0.25, "rgba(106,241,255,0.95)");
    g.addColorStop(1, "rgba(255,79,216,0)");
    bCtx.fillStyle = g;
    bCtx.shadowColor = "rgba(255,255,255,0.8)";
    bCtx.shadowBlur = 18;
    bCtx.fill();

    bCtx.shadowBlur = 0;
    bCtx.strokeStyle = "rgba(255,255,255,0.75)";
    bCtx.lineWidth = 2;
    bCtx.beginPath();
    bCtx.moveTo(0, 38);
    bCtx.quadraticCurveTo(8, 52, -2, 70);
    bCtx.stroke();

    const balloonTex = new THREE.CanvasTexture(bCanvas);
    balloonTex.encoding = THREE.sRGBEncoding;

    const balloonMat = new THREE.MeshBasicMaterial({
      map: balloonTex,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    balloonMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), balloonMat);
    balloonMesh.position.set(0, CONFIG.hatHeight / 2 + 8, 0);
    scene.add(balloonMesh);

    // Cake text mesh (ONLY in HEART/CAKE) - moved BELOW cake
    cakeCanvas = document.createElement("canvas");
    cakeCanvas.width = 1024; cakeCanvas.height = 256;
    cakeCtx = cakeCanvas.getContext("2d");
    cakeTex = new THREE.CanvasTexture(cakeCanvas);
    cakeTex.encoding = THREE.sRGBEncoding;

    const cakeMat = new THREE.MeshBasicMaterial({
      map: cakeTex,
      transparent: true,
      blending: THREE.AdditiveBlending
    });

    cakeTextMesh = new THREE.Mesh(new THREE.PlaneGeometry(92, 22), cakeMat);
    cakeTextMesh.position.set(0, -12, 38); // lowered under cake
    cakeTextMesh.visible = false;
    scene.add(cakeTextMesh);

    // Flames
    const flameBaseMat = new THREE.MeshBasicMaterial({
      map: textures.flame,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const flameGeo = new THREE.PlaneGeometry(5.5, 8.0);
    flameMeshes = [];
    for (let i = 0; i < CAKE.candleCount; i++) {
      const m = new THREE.Mesh(flameGeo, flameBaseMat.clone());
      m.visible = false;
      scene.add(m);
      flameMeshes.push(m);
    }

    // initial paint
    updateTitleTexture(WISHES[0]);
    updateCakeTextTexture(WISHES[0]);
  }

  // ---------- Confetti ----------
  function createConfetti() {
    const count = CONFIG.confettiCount;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const drift = new Float32Array(count);
    const spin = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * CONFIG.confettiBox;
      positions[i * 3 + 1] = (Math.random() - 0.2) * CONFIG.confettiBox + 70;
      positions[i * 3 + 2] = (Math.random() - 0.5) * CONFIG.confettiBox;

      velocities[i] = 10 + Math.random() * 20;
      drift[i] = (Math.random() - 0.5) * 2.4;
      spin[i] = Math.random() * Math.PI * 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.userData.velocities = velocities;
    geo.userData.drift = drift;
    geo.userData.spin = spin;

    const mat = new THREE.PointsMaterial({
      size: 2.35,
      map: textures.confetti,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });

    confettiPoints = new THREE.Points(geo, mat);
    scene.add(confettiPoints);
  }

  function updateConfetti(time, dt) {
    if (!confettiPoints) return;

    const pos = confettiPoints.geometry.attributes.position.array;
    const v = confettiPoints.geometry.userData.velocities;
    const d = confettiPoints.geometry.userData.drift;
    const s = confettiPoints.geometry.userData.spin;

    const wind = (handX - 0.5) * 26;

    for (let i = 0; i < v.length; i++) {
      const idx = i * 3;
      pos[idx + 1] -= v[i] * dt;
      pos[idx] += (d[i] + wind * 0.06) * dt;
      pos[idx + 2] += Math.sin(time * 0.7 + s[i]) * 0.08;

      if (pos[idx + 1] < -65) {
        pos[idx + 1] = 95 + Math.random() * 35;
        pos[idx] = (Math.random() - 0.5) * CONFIG.confettiBox;
        pos[idx + 2] = (Math.random() - 0.5) * CONFIG.confettiBox;
      }
    }
    confettiPoints.geometry.attributes.position.needsUpdate = true;
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
        const brightness = 0.78 + 0.40 * Math.sin(time * 8 + phases[i]);
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
      const bounce = 1 + Math.abs(Math.sin(time * 2.2)) * 0.06;
      group.scale.set(bounce, bounce, bounce);

      for (let i = 0; i < count; i++) {
        sizes[i] = baseSize * (0.95 + 0.18 * Math.sin(time * 6 + phases[i]));
        colors[i * 3] = baseColor.r;
        colors[i * 3 + 1] = baseColor.g;
        colors[i * 3 + 2] = baseColor.b;
      }
      group.geometry.attributes.size.needsUpdate = true;
      group.geometry.attributes.color.needsUpdate = true;
      return;
    }

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

  // ---------- Main loop ----------
  function animate() {
    requestAnimationFrame(animate);

    const time = performance.now() * 0.001;
    const dt = Math.min(clock.getDelta(), 0.033);

    camera.position.x = Math.sin(time * 0.18) * 4;
    camera.position.y = 10 + Math.sin(time * 0.12) * 1.2;
    camera.lookAt(0, 0, 0);

    const speed = 0.08;
    const handRotY = (handX - 0.5) * 4.0;

    updateParticleGroup(groupGold, "gold", state, speed, handRotY, time);
    updateParticleGroup(groupRed, "red", state, speed, handRotY, time);
    updateParticleGroup(groupGift, "gift", state, speed, handRotY, time);

    updateConfetti(time, dt);

    // Title & balloon
    if (titleMesh) {
      titleMesh.visible = (state === "TREE");
      titleMesh.position.y = 52 + Math.sin(time * 0.8) * 1.0;
      titleMesh.material.opacity = 0.86 + 0.12 * Math.sin(time * 2.0);
    }
    if (balloonMesh) {
      balloonMesh.visible = (state === "TREE");
      balloonMesh.rotation.z = time * 0.6;
      const s = 1 + 0.08 * Math.sin(time * 5);
      balloonMesh.scale.set(s, s, 1);
      balloonMesh.position.y = CONFIG.hatHeight / 2 + 8 + Math.sin(time * 1.2) * 1.2;
    }

    // Cake text (below cake)
    if (cakeTextMesh) {
      cakeTextMesh.visible = (state === "HEART");
      if (cakeTextMesh.visible) {
        const s = 1 + Math.abs(Math.sin(time * 2.6)) * 0.05;
        cakeTextMesh.scale.set(s, s, 1);
        cakeTextMesh.material.opacity = 0.88 + 0.10 * Math.sin(time * 2.2);
      }
    }

    // Flames visible only on CAKE
    if (flameMeshes && flameMeshes.length) {
      const visible = (state === "HEART");
      const ring = CAKE.candleRing;
      const topY = CAKE.y0 + (CAKE.baseH / 2) + CAKE.topH + CAKE.candleH + 1.6;

      for (let i = 0; i < flameMeshes.length; i++) {
        const m = flameMeshes[i];
        m.visible = visible;
        if (!visible) continue;

        const a = (i / flameMeshes.length) * Math.PI * 2 + 0.35;
        const x = Math.cos(a) * ring;
        const z = Math.sin(a) * ring;

        m.position.set(x, topY + Math.sin(time * 3 + i) * 0.9, z);
        m.lookAt(camera.position);

        const flick = 1 + 0.15 * Math.sin(time * 12 + i);
        m.scale.set(flick, flick, 1);
        m.material.opacity = 0.85 + 0.10 * Math.sin(time * 8 + i);
      }
    }

    // Hand-follow for photo orbit
    const targetFollowX = (handX - 0.5) * (CONFIG.photoFollowRange || 0);
    const followK = (state === "EXPLODE") ? (CONFIG.photoFollowSmoothing || 0.12) : 0.08;
    orbitOffsetX += (targetFollowX - orbitOffsetX) * followK;

    // Photos states
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
        const x = orbitOffsetX + Math.sin(angle) * CONFIG.photoOrbitRadius;
        const z = Math.cos(angle) * CONFIG.photoOrbitRadius + (CONFIG.photoOrbitZ || 0);
        const y = (CONFIG.photoOrbitY || 0) + Math.sin(time + i) * 3.6;

        mesh.position.lerp(new THREE.Vector3(x, y, z), 0.12);
        mesh.lookAt(camera.position);
        mesh.rotation.z = Math.sin(time * 0.7 + i) * 0.06;

        const aspect = mesh.userData.aspect || 1;
        if (z > maxZ) { maxZ = z; bestIdx = i; }

        const zMin = (CONFIG.photoOrbitZ || 0) - CONFIG.photoOrbitRadius;
        const t = THREE.MathUtils.clamp((z - zMin) / (2 * CONFIG.photoOrbitRadius), 0, 1);
        const ds = 1.4 + t * 3.2;
        mesh.scale.lerp(new THREE.Vector3(ds * aspect, ds, ds), 0.12);
      }

      selectedIndex = bestIdx;
    } else if (state === "PHOTO") {
      for (let i = 0; i < photoMeshes.length; i++) {
        const mesh = photoMeshes[i];
        const aspect = mesh.userData.aspect || 1;
        mesh.visible = true;

        if (i === selectedIndex) {
          mesh.position.lerp(new THREE.Vector3(0, (CONFIG.photoViewY || 0), 85), 0.12);
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

    function drawPreview(image) {
      const w = canvas.width, h = canvas.height;
      const iw = image.videoWidth || image.width || w;
      const ih = image.videoHeight || image.height || h;

      ctx.save();
      ctx.clearRect(0, 0, w, h);

      ctx.filter = CONFIG.cameraFilter || "none";

      if (!iw || !ih) {
        ctx.drawImage(image, 0, 0, w, h);
      } else {
        const scale = Math.min(w / iw, h / ih);
        const dw = iw * scale;
        const dh = ih * scale;
        const dx = (w - dw) * 0.5;
        const dy = (h - dh) * 0.5;
        ctx.drawImage(image, 0, 0, iw, ih, dx, dy, dw, dh);
      }

      ctx.filter = "none";

      if (CONFIG.cameraTint) {
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = CONFIG.cameraTint;
        ctx.fillRect(0, 0, w, h);
      }
      if (CONFIG.cameraTint2) {
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = CONFIG.cameraTint2;
        ctx.fillRect(0, 0, w, h);
      }

      const vig = Math.max(0, Math.min(0.25, CONFIG.cameraVignette ?? 0.14));
      if (vig > 0) {
        ctx.globalCompositeOperation = "source-over";
        const g = ctx.createRadialGradient(w * 0.5, h * 0.45, h * 0.10, w * 0.5, h * 0.5, h * 0.85);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, `rgba(0,0,0,${vig})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.restore();
    }

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
        if (results.image) drawPreview(results.image);

        const lms = results.multiHandLandmarks || [];

        if (lms.length > 0) lastHandSeenAt = performance.now();

        // 🫶 (2 hands) -> CAKE
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

          const tips = [8, 12, 16, 20];
          const wrist = lm[0];

          let openDist = 0;
          for (const idx of tips) openDist += Math.hypot(lm[idx].x - wrist.x, lm[idx].y - wrist.y);
          const avgDist = openDist / tips.length;

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

    const mpCamera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 320,
      height: 240
    });

    mpCamera.start();
  }

  // ---------- Start ----------
  async function startSystem() {
    if (started) return;
    started = true;

    btnStart.style.display = "none";
    if (imgStatus) imgStatus.textContent = "Đang khởi động… Cho phép Camera nếu được hỏi nhé.";

    // Wish init + auto rotate (không có nút)
    setWishText(WISHES[0]);
    setInterval(nextWish, 12000);

    // Meme spam
    startMemeSpam();

    // Audio (needs gesture)
    bgMusic.play().catch(() => { /* ignore */ });

    // 3D
    init3D();

    // Hands
    try {
      await initHands();
      if (imgStatus) imgStatus.textContent = "Sẵn sàng ✨ 🫶 = bánh sinh nhật | 🖐 = confetti + vòng ảnh | 👌 = zoom ảnh | ✊ = nón party";
    } catch (e) {
      if (imgStatus) imgStatus.textContent = "Không mở được Camera (bạn chặn quyền). Bạn vẫn xem 3D được.";
      console.warn(e);
    }
  }

  window.addEventListener("resize", () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  document.addEventListener("DOMContentLoaded", () => {
    btnStart?.addEventListener("click", startSystem);
  });
})();
