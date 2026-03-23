(() => {
  "use strict";

  // --- Canvas & HUD refs --------------------------------------------------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const scoreEl = document.getElementById("score");
  const livesEl = document.getElementById("lives");
  const statusEl = document.getElementById("status");

  const WORLD_WIDTH = canvas.width;
  const WORLD_HEIGHT = canvas.height;

  // --- Tuning constants ---------------------------------------------------
  const SHIP_RADIUS = 14;
  const SHIP_TURN_SPEED = 3.6; // rad/s
  const SHIP_THRUST = 260;
  const SHIP_FRICTION = 0.992;
  const MAX_SHIP_SPEED = 360;

  const BULLET_SPEED = 520;
  const BULLET_TTL = 1.05; // seconds
  const BULLET_COOLDOWN = 0.14;

  const INITIAL_LIVES = 3;
  const ASTEROID_SIZES = [44, 28, 16];
  const ASTEROID_SPLIT_SCORE = [20, 50, 100]; // large, medium, small

  const RESPAWN_INVULN = 1.6;
  const HIT_FLASH_TIME = 0.15;

  // --- Mutable game state -------------------------------------------------
  let keys;
  let ship;
  let bullets;
  let asteroids;
  let particles;
  let score;
  let lives;
  let gameOver;
  let paused;
  let lastTime;
  let wave;

  function createShip() {
    return {
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      fireCooldown: 0,
      invulnerableFor: RESPAWN_INVULN,
      thrusting: false,
      muzzleFlashFor: 0,
      hitFlashFor: 0,
    };
  }

  function createAsteroid(x, y, sizeIndex) {
    const speedBase = 40 + Math.random() * 55 + sizeIndex * 20;
    const dir = Math.random() * Math.PI * 2;
    return {
      x,
      y,
      vx: Math.cos(dir) * speedBase,
      vy: Math.sin(dir) * speedBase,
      sizeIndex,
      radius: ASTEROID_SIZES[sizeIndex],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.2,
      shape: generateRockShape(),
      hitFlashFor: 0,
    };
  }

  function generateRockShape() {
    const points = 11;
    const shape = [];
    for (let i = 0; i < points; i += 1) {
      const t = i / points;
      const jitter = 0.72 + Math.random() * 0.55;
      shape.push({ t, r: jitter });
    }
    return shape;
  }

  function spawnWave(count) {
    for (let i = 0; i < count; i += 1) {
      const edge = Math.floor(Math.random() * 4);
      let x;
      let y;

      if (edge === 0) {
        x = Math.random() * WORLD_WIDTH;
        y = -20;
      } else if (edge === 1) {
        x = WORLD_WIDTH + 20;
        y = Math.random() * WORLD_HEIGHT;
      } else if (edge === 2) {
        x = Math.random() * WORLD_WIDTH;
        y = WORLD_HEIGHT + 20;
      } else {
        x = -20;
        y = Math.random() * WORLD_HEIGHT;
      }

      // Nicht direkt über dem Spieler spawnen
      if (distance(x, y, ship.x, ship.y) < 180) {
        i -= 1;
        continue;
      }

      asteroids.push(createAsteroid(x, y, 0));
    }
  }

  function resetGame() {
    keys = { left: false, right: false, thrust: false, shoot: false };
    ship = createShip();
    bullets = [];
    asteroids = [];
    particles = [];
    score = 0;
    lives = INITIAL_LIVES;
    gameOver = false;
    paused = false;
    wave = 1;

    spawnWave(4);
    setStatus("Status: Laufend");
    updateHud();
  }

  // --- Input --------------------------------------------------------------
  window.addEventListener("keydown", (event) => {
    if (event.code === "ArrowLeft") keys.left = true;
    if (event.code === "ArrowRight") keys.right = true;
    if (event.code === "ArrowUp") keys.thrust = true;
    if (event.code === "Space") {
      keys.shoot = true;
      event.preventDefault();
    }
    if (event.code === "KeyP" && !gameOver) {
      paused = !paused;
      setStatus(paused ? "Status: Pausiert (P zum Fortsetzen)" : "Status: Laufend");
    }

    if (event.code === "KeyR" && gameOver) {
      resetGame();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "ArrowLeft") keys.left = false;
    if (event.code === "ArrowRight") keys.right = false;
    if (event.code === "ArrowUp") keys.thrust = false;
    if (event.code === "Space") keys.shoot = false;
  });

  // --- Main Loop ----------------------------------------------------------
  function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
    lastTime = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
  }

  function update(dt) {
    if (gameOver) {
      updateParticles(dt);
      return;
    }
    if (paused) return;

    updateShip(dt);
    updateBullets(dt);
    updateAsteroids(dt);
    updateParticles(dt);
    handleCollisions();

    if (asteroids.length === 0) {
      wave += 1;
      spawnWave(Math.min(4 + wave, 10));
      setStatus(`Status: Welle ${wave}`);
    }

    updateHud();
  }

  // --- Entity updates -----------------------------------------------------
  function updateShip(dt) {
    if (keys.left) ship.angle -= SHIP_TURN_SPEED * dt;
    if (keys.right) ship.angle += SHIP_TURN_SPEED * dt;

    ship.thrusting = keys.thrust;

    if (ship.thrusting) {
      ship.vx += Math.cos(ship.angle) * SHIP_THRUST * dt;
      ship.vy += Math.sin(ship.angle) * SHIP_THRUST * dt;
      emitExhaust();
    }

    // Begrenzte Höchstgeschwindigkeit
    const speed = Math.hypot(ship.vx, ship.vy);
    if (speed > MAX_SHIP_SPEED) {
      const factor = MAX_SHIP_SPEED / speed;
      ship.vx *= factor;
      ship.vy *= factor;
    }

    ship.vx *= SHIP_FRICTION;
    ship.vy *= SHIP_FRICTION;

    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    wrap(ship);

    ship.fireCooldown -= dt;
    ship.invulnerableFor = Math.max(0, ship.invulnerableFor - dt);
    ship.hitFlashFor = Math.max(0, ship.hitFlashFor - dt);
    ship.muzzleFlashFor = Math.max(0, ship.muzzleFlashFor - dt);

    if (keys.shoot && ship.fireCooldown <= 0) {
      fireBullet();
      ship.fireCooldown = BULLET_COOLDOWN;
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.ttl -= dt;
      wrap(b);

      if (b.ttl <= 0) bullets.splice(i, 1);
    }
  }

  function updateAsteroids(dt) {
    for (const a of asteroids) {
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.rotation += a.spin * dt;
      a.hitFlashFor = Math.max(0, a.hitFlashFor - dt);
      wrap(a);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.986;
      p.vy *= 0.986;
      p.life -= dt;
      wrap(p);

      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function fireBullet() {
    const tipX = ship.x + Math.cos(ship.angle) * (SHIP_RADIUS + 2);
    const tipY = ship.y + Math.sin(ship.angle) * (SHIP_RADIUS + 2);
    bullets.push({
      x: tipX,
      y: tipY,
      vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.3,
      vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.3,
      ttl: BULLET_TTL,
      radius: 2,
    });

    ship.muzzleFlashFor = 0.05;
  }

  function emitExhaust() {
    if (Math.random() > 0.72) return;

    const base = ship.angle + Math.PI;
    particles.push({
      x: ship.x + Math.cos(base) * 10,
      y: ship.y + Math.sin(base) * 10,
      vx: Math.cos(base) * (35 + Math.random() * 30) + (Math.random() - 0.5) * 26,
      vy: Math.sin(base) * (35 + Math.random() * 30) + (Math.random() - 0.5) * 26,
      life: 0.35,
      color: "#f4d35e",
      size: 2,
    });
  }

  function createExplosion(x, y, color, amount = 14) {
    for (let i = 0; i < amount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 35 + Math.random() * 140;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + Math.random() * 0.4,
        color,
        size: 2 + Math.random() * 2,
      });
    }
  }

  // --- Collisions ---------------------------------------------------------
  function handleCollisions() {
    // Bullet vs asteroid
    for (let bi = bullets.length - 1; bi >= 0; bi -= 1) {
      const b = bullets[bi];
      let bulletHit = false;

      for (let ai = asteroids.length - 1; ai >= 0; ai -= 1) {
        const a = asteroids[ai];
        if (distance(b.x, b.y, a.x, a.y) <= a.radius + b.radius) {
          bullets.splice(bi, 1);
          splitAsteroid(ai);
          bulletHit = true;
          break;
        }
      }

      if (bulletHit) continue;
    }

    // Ship vs asteroid
    if (ship.invulnerableFor > 0) return;

    for (const a of asteroids) {
      if (distance(ship.x, ship.y, a.x, a.y) <= a.radius + SHIP_RADIUS * 0.8) {
        onShipHit();
        break;
      }
    }
  }

  function splitAsteroid(index) {
    const asteroid = asteroids[index];
    asteroids.splice(index, 1);

    asteroid.hitFlashFor = HIT_FLASH_TIME;
    score += ASTEROID_SPLIT_SCORE[asteroid.sizeIndex] || 0;
    createExplosion(asteroid.x, asteroid.y, "#8ec5ff", 12);

    if (asteroid.sizeIndex < ASTEROID_SIZES.length - 1) {
      const nextSize = asteroid.sizeIndex + 1;
      for (let i = 0; i < 2; i += 1) {
        const child = createAsteroid(asteroid.x, asteroid.y, nextSize);
        child.vx += asteroid.vx * 0.35;
        child.vy += asteroid.vy * 0.35;
        asteroids.push(child);
      }
    }
  }

  function onShipHit() {
    lives -= 1;
    ship.hitFlashFor = HIT_FLASH_TIME;
    createExplosion(ship.x, ship.y, "#ff9aa2", 18);

    if (lives <= 0) {
      gameOver = true;
      setStatus("Status: GAME OVER · Drücke R für Neustart");
      return;
    }

    ship = createShip();
    setStatus("Status: Treffer! Kurz unverwundbar...");
  }

  // --- Rendering ----------------------------------------------------------
  function render() {
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    drawStarfield();

    drawShip();
    drawBullets();
    drawAsteroids();
    drawParticles();

    if (gameOver) drawGameOverOverlay();
    if (paused) drawPauseOverlay();
  }

  function drawStarfield() {
    // Simples, deterministisches Sternfeld
    ctx.save();
    ctx.fillStyle = "#0f1525";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    for (let i = 0; i < 100; i += 1) {
      const x = (i * 137.5) % WORLD_WIDTH;
      const y = (i * 79.3 + 53) % WORLD_HEIGHT;
      ctx.fillStyle = i % 5 === 0 ? "#7f8fb8" : "#405178";
      ctx.fillRect(x, y, 1.9, 1.9);
    }

    drawBackgroundPlanets();
    ctx.restore();
  }

  function drawBackgroundPlanets() {
    const planets = [
      { x: WORLD_WIDTH * 0.2, y: WORLD_HEIGHT * 0.22, radius: 72, base: "#4f6a92", glow: "#6e8fc7" },
      { x: WORLD_WIDTH * 0.84, y: WORLD_HEIGHT * 0.18, radius: 58, base: "#41587d", glow: "#5f7fb2" },
    ];

    for (const planet of planets) {
      ctx.save();
      ctx.translate(planet.x, planet.y);

      // Sichtbarer Halo, damit Planeten klar im Hintergrund auffallen
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = planet.glow;
      ctx.beginPath();
      ctx.arc(0, 0, planet.radius * 1.35, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = planet.base;
      ctx.beginPath();
      ctx.arc(0, 0, planet.radius, 0, Math.PI * 2);
      ctx.fill();

      // Geometrische Flächen für einen stilisierten Planeten-Look
      ctx.globalAlpha = 0.72;
      for (let i = 0; i < 8; i += 1) {
        const a1 = (i / 8) * Math.PI * 2;
        const a2 = ((i + 1) / 8) * Math.PI * 2;
        const inner = planet.radius * 0.28;
        const outer = planet.radius * (0.64 + (i % 3) * 0.08);

        ctx.fillStyle = i % 2 === 0 ? "#7f9ece" : "#304463";
        ctx.beginPath();
        ctx.moveTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
        ctx.lineTo(Math.cos(a1) * outer, Math.sin(a1) * outer);
        ctx.lineTo(Math.cos(a2) * outer, Math.sin(a2) * outer);
        ctx.lineTo(Math.cos(a2) * inner, Math.sin(a2) * inner);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = "#a8c0ea";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, planet.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Einfache Orbit-Ringe als zusätzliche geometrische Formen
      ctx.strokeStyle = "#8eaadb";
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, planet.radius * 1.25, planet.radius * 0.45, Math.PI / 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.restore();
    }
  }

  function drawShip() {
    const blink = ship.invulnerableFor > 0 && Math.floor(ship.invulnerableFor * 14) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    const bodyColor = ship.hitFlashFor > 0 ? "#ff7f8b" : "#e9f0ff";
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SHIP_RADIUS, 0);
    ctx.lineTo(-SHIP_RADIUS * 0.85, SHIP_RADIUS * 0.65);
    ctx.lineTo(-SHIP_RADIUS * 0.5, 0);
    ctx.lineTo(-SHIP_RADIUS * 0.85, -SHIP_RADIUS * 0.65);
    ctx.closePath();
    ctx.stroke();

    if (ship.thrusting) {
      ctx.strokeStyle = "#f4d35e";
      ctx.beginPath();
      ctx.moveTo(-SHIP_RADIUS * 0.85, 0);
      ctx.lineTo(-SHIP_RADIUS - (4 + Math.random() * 8), 0);
      ctx.stroke();
    }

    if (ship.muzzleFlashFor > 0) {
      ctx.strokeStyle = "#ff5a5a";
      ctx.beginPath();
      ctx.moveTo(SHIP_RADIUS, 0);
      ctx.lineTo(SHIP_RADIUS + 8, 0);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBullets() {
    ctx.fillStyle = "#ff5a5a";
    for (const b of bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAsteroids() {
    for (const a of asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rotation);
      ctx.strokeStyle = a.hitFlashFor > 0 ? "#ffe08a" : "#9fb0d1";
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < a.shape.length; i += 1) {
        const p = a.shape[i];
        const angle = p.t * Math.PI * 2;
        const radius = a.radius * p.r;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.closePath();
      ctx.fillStyle = a.hitFlashFor > 0 ? "#9da3ad" : "#5f6673";
      ctx.fill();
      ctx.stroke();

      // Geometrische Facetten für eine steinige Oberfläche
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < a.shape.length; i += 3) {
        const p1 = a.shape[i % a.shape.length];
        const p2 = a.shape[(i + 1) % a.shape.length];
        const p3 = a.shape[(i + 2) % a.shape.length];

        const a1 = p1.t * Math.PI * 2;
        const a2 = p2.t * Math.PI * 2;
        const a3 = p3.t * Math.PI * 2;

        const r1 = a.radius * p1.r * 0.7;
        const r2 = a.radius * p2.r * 0.65;
        const r3 = a.radius * p3.r * 0.72;

        ctx.fillStyle = i % 2 === 0 ? "#818999" : "#4f5561";
        ctx.beginPath();
        ctx.moveTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
        ctx.lineTo(Math.cos(a3) * r3, Math.sin(a3) * r3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = Math.max(0, p.life / 0.7);
      ctx.fillStyle = withAlpha(p.color, alpha);
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }

  function drawGameOverOverlay() {
    ctx.save();
    ctx.fillStyle = "rgba(2, 4, 10, 0.62)";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff9aa2";
    ctx.font = "bold 54px 'Courier New', monospace";
    ctx.fillText("GAME OVER", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 - 30);

    ctx.fillStyle = "#d7e2ff";
    ctx.font = "20px 'Courier New', monospace";
    ctx.fillText("Drücke R für Neustart", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 20);
    ctx.fillText(`Final Score: ${score}`, WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 52);
    ctx.restore();
  }

  function drawPauseOverlay() {
    ctx.save();
    ctx.fillStyle = "rgba(2, 4, 10, 0.5)";
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    ctx.textAlign = "center";
    ctx.fillStyle = "#9cf9ea";
    ctx.font = "bold 44px 'Courier New', monospace";
    ctx.fillText("PAUSE", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 - 10);

    ctx.fillStyle = "#d7e2ff";
    ctx.font = "18px 'Courier New', monospace";
    ctx.fillText("Drücke P zum Fortsetzen", WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 24);
    ctx.restore();
  }

  // --- Utilities ----------------------------------------------------------
  function wrap(entity) {
    if (entity.x < 0) entity.x += WORLD_WIDTH;
    if (entity.x >= WORLD_WIDTH) entity.x -= WORLD_WIDTH;
    if (entity.y < 0) entity.y += WORLD_HEIGHT;
    if (entity.y >= WORLD_HEIGHT) entity.y -= WORLD_HEIGHT;
  }

  function distance(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function withAlpha(hex, alpha) {
    const norm = hex.replace("#", "");
    if (norm.length !== 6) return hex;
    const r = parseInt(norm.slice(0, 2), 16);
    const g = parseInt(norm.slice(2, 4), 16);
    const b = parseInt(norm.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }

  function updateHud() {
    scoreEl.textContent = `Score: ${score}`;
    livesEl.textContent = `Leben: ${lives}`;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  // --- Boot ---------------------------------------------------------------
  resetGame();
  requestAnimationFrame(gameLoop);
})();
