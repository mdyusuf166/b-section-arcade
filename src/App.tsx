import { useEffect, useMemo, useRef, useState } from 'react';

type Screen =
  | 'menu'
  | 'countdown'
  | 'playing'
  | 'paused'
  | 'gameover'
  | 'victory'
  | 'leaderboard'
  | 'howto'
  | 'settings';

type EnemyType = 'basic' | 'swarm' | 'bomber' | 'speedster' | 'runner' | 'vip' | 'boss';
type PowerUpType = 'double' | 'rapid' | 'shield' | 'mega' | 'clear' | 'boost' | 'repair';
type SpawnEntry = 'top' | 'left' | 'right' | 'diagonal';
type SpawnOrder = { type: EnemyType; entry: SpawnEntry; offsetX: number; offsetY: number };
type FinalSequence = 'idle' | 'quiet' | 'intro' | 'entering' | 'boss-entry' | 'active' | 'defeat' | 'silence' | 'last-word' | 'victory-approach';

type Vec = { x: number; y: number };

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  radius: number;
};

type Bullet = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  damage: number;
  enemy: boolean;
  color: string;
};

type Enemy = {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  shootCooldown: number;
  cooldown: number;
  points: number;
  direction: number;
  phase: number;
  taunt?: string;
  isRunner?: boolean;
  isFakeDead?: boolean;
  fakeDeadTimer?: number;
  entry?: SpawnEntry;
  hitFlash?: number;
  wrongWayTimer?: number;
  isMeeting?: boolean;
  isTrafficJammed?: boolean;
  isCelebrating?: boolean;
};

type PowerUp = {
  type: PowerUpType;
  x: number;
  y: number;
  r: number;
  vy: number;
};

type LeaderboardEntry = { id?: string; name: string; score: number; wave: number; date: string; duration?: number; bestCombo?: number; mode?: 'campaign' | 'endless' };
type FloatingText = { x: number; y: number; text: string; color: string; life: number; maxLife: number };
type SavedSettings = { soundOn: boolean; musicOn: boolean; screenShake: boolean; reducedMotion: boolean; banglaComedy: boolean };

type HudState = {
  score: number;
  highScore: number;
  wave: number;
  combo: number;
  statusMessage: string;
  bossHp: number;
  bossMaxHp: number;
  screen: Screen;
  countdown: number;
  enemyCount: number;
  powerMode: string;
  playerHp: number;
  playerMaxHp: number;
  powerUps: { key: string; icon: string; label: string; time: number; color: string }[];
};

const WORLD_WIDTH = 900;
const WORLD_HEIGHT = 640;
const STORAGE_KEY = 'b-section-invasion';
const PLAYER_MAX_HP = 300;
const NAME_KEY = 'bsection_player_name';
const CAMPAIGN_SCORES_KEY = 'bsection_campaign_leaderboard';
const ENDLESS_SCORES_KEY = 'bsection_endless_leaderboard';
const SETTINGS_KEY = 'bsection_settings';
const DEFAULT_LEADERBOARD: LeaderboardEntry[] = [];

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readStorage = (): { highScore: number; bestCampaignCombo: number; bestEndlessWave: number; bestEndlessScore: number; leaderboard: LeaderboardEntry[]; settings: SavedSettings } => {
  const defaults = { highScore: 0, bestCampaignCombo: 0, bestEndlessWave: 0, bestEndlessScore: 0, leaderboard: DEFAULT_LEADERBOARD, settings: { soundOn: true, musicOn: true, screenShake: true, reducedMotion: false, banglaComedy: true } };
  if (typeof window === 'undefined') {
    return defaults;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem('b-section-invasion');
    const parsed = raw ? JSON.parse(raw) : {};
    const settingsRaw = window.localStorage.getItem(SETTINGS_KEY);
    const savedSettings = settingsRaw ? JSON.parse(settingsRaw) : parsed.settings;
    const campaignRaw = window.localStorage.getItem(CAMPAIGN_SCORES_KEY) ?? window.localStorage.getItem('b-section-campaign-scores');
    const endlessRaw = window.localStorage.getItem(ENDLESS_SCORES_KEY) ?? window.localStorage.getItem('b-section-endless-scores');
    const campaign = campaignRaw ? JSON.parse(campaignRaw) : null;
    const endless = endlessRaw ? JSON.parse(endlessRaw) : null;
    const oldScores = Array.isArray(parsed.leaderboard) ? parsed.leaderboard as LeaderboardEntry[] : [];
    const leaderboard = [...(Array.isArray(campaign) ? campaign : oldScores.filter((entry) => (entry.mode ?? 'campaign') === 'campaign')),
      ...(Array.isArray(endless) ? endless : oldScores.filter((entry) => entry.mode === 'endless'))];
    return {
      highScore: Number(parsed.highScore || 0),
      bestCampaignCombo: Number(parsed.bestCampaignCombo || 0),
      bestEndlessWave: Number(parsed.bestEndlessWave || 0),
      bestEndlessScore: Number(parsed.bestEndlessScore || 0),
      leaderboard,
      settings: { soundOn: savedSettings?.soundOn ?? parsed.soundOn !== false, musicOn: savedSettings?.musicOn ?? parsed.musicOn !== false, screenShake: savedSettings?.screenShake !== false, reducedMotion: savedSettings?.reducedMotion === true, banglaComedy: savedSettings?.banglaComedy !== false },
    };
  } catch {
    return defaults;
  }
};

const writeStorage = (state: { highScore: number; bestCampaignCombo: number; bestEndlessWave: number; bestEndlessScore: number; leaderboard: LeaderboardEntry[]; settings: SavedSettings }) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ highScore: state.highScore, bestCampaignCombo: state.bestCampaignCombo, bestEndlessWave: state.bestEndlessWave, bestEndlessScore: state.bestEndlessScore }));
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    const rank = (a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score || b.wave - a.wave || (b.bestCombo ?? 0) - (a.bestCombo ?? 0);
    window.localStorage.setItem(CAMPAIGN_SCORES_KEY, JSON.stringify(state.leaderboard.filter((entry) => (entry.mode ?? 'campaign') === 'campaign').sort(rank).slice(0, 10)));
    window.localStorage.setItem(ENDLESS_SCORES_KEY, JSON.stringify(state.leaderboard.filter((entry) => entry.mode === 'endless').sort(rank).slice(0, 10)));
  } catch { /* Storage may be disabled; the current run remains playable. */ }
};

const normalizePowerMode = (value: number) => {
  if (value > 0) {
    return 'ACTIVE';
  }
  return 'READY';
};

const messages = [
  'ভাবি, বি সেকশন আবারও ঘুরে এসেছে!',
  'এবারও না, ভাবি! আবারও টানাপোড়েন!',
  'বি সেকশন ড্রোন ভরা, ভাবি!',
  'এতগুলো বস্তুর উপর কেমনে? ভাবি!',
  'একটা ধাক্কা দিলেই তারা জ্বলে উঠছে, ভাবি!',
  'এটাই তো ক্যাম্পাস লজিক, ভাবি!',
  'বারবার আসছে, ভাবি—দুরের কথা নয়!',
  'শেষের ফাইনাল এসেছে, ভাবি!',
  'কম্বো +১, ভাবি!',
  'বি সেকশন এখন পুরো মাঠ জুড়ে, ভাবি!',
];

const rareEventLines = [
  'র্যার ইভেন্ট: কফি ব্রেক ফাঁকি, ভাবি!',
  'র্যার ইভেন্ট: সাউন্ড বাজিয়ে সেকশন দৌড়ায়!',
  'র্যার ইভেন্ট: আকাশে ভেসে বেড়াচ্ছে জাদুকর রঙ!',
  'র্যার ইভেন্ট: তোর মোবাইলের মতো স্পিড, ভাবি!',
  'র্যার ইভেন্ট: এক্সট্রা পাওয়ার অচ্ছে, ভাবি!',
];

const taunts = [
  'ধরতে পারবা?',
  'এদিকে আসো!',
  'আরও আসতেছে!',
  'শেষ ভাবছো?',
  'আমরা অনেক!',
  'আবার দেখা হবে!',
  'এইটা শুধু শুরু!',
];

const randomMessage = () => messages[Math.floor(Math.random() * messages.length)];
const randomRareEvent = () => rareEventLines[Math.floor(Math.random() * rareEventLines.length)];
const randomTaunt = () => taunts[Math.floor(Math.random() * taunts.length)];
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const getCampaignTitle = (wave: number) => {
  if (wave <= 5) return 'ACT 1 — শান্তি ছিল';
  if (wave <= 10) return 'ACT 2 — B Section হাজির';
  if (wave <= 15) return 'ACT 3 — এখন আর শান্তি নাই';
  if (wave <= 20) return 'ACT 4 — পুরা B Section';
  if (wave <= 25) return 'ACT 5 — ভাবি, এখন সিরিয়াস';
  if (wave <= 30) return 'ACT 6 — LAKA UTHAO ARC';
  if (wave <= 35) return 'ACT 7 — FINAL ASSAULT';
  if (wave <= 39) return 'ACT 8 — শেষের আগে';
  return 'FINAL BATTLE';
};

const getWaveCommentary = (wave: number) => {
  if (wave === 1) return 'ভাবি, মনে হয় আজকে শান্তি আছে...';
  if (wave === 5) return 'এখনো তো ভালোই চলছে, ভাবি.';
  if (wave === 10) return 'ভাবি, সিরিয়াসলি... এখনো খেলতেছো?';
  if (wave === 15) return 'এখন আর পিছনে যাওয়ার রাস্তা নাই, ভাবি.';
  if (wave === 20) return 'শেষ লড়াই খুব কাছে, ভাবি...';
  if (wave >= 25) return 'এবার শেষ লড়াই! ভাবি, প্রস্তুত তো?';
  return 'বি সেকশন আবারও ঘুরে এসেছে, ভাবি!';
};

const getCheckpointText = (wave: number) => {
  if (wave === 5) return 'ভাবি, এতদূর আসছো! একটু শ্বাস নাও। 😭';
  if (wave === 10) return 'ওই দেখো, খেলোয়াড় এখনো টিকে আছে! একটু ঘুরে আসো, ভাবি.';
  if (wave === 15) return 'এই তো, এখনো তুই চালিয়ে যাচ্ছিস!';
  if (wave === 20) return 'একটু রিফিল, ভাবি—শেষটা আসছে।';
  return 'চেকপয়েন্ট reached ✅ — একটু ধরে ফেলো, ভাবি!';
};

const getWaveSubtitle = (wave: number) => {
  if (wave === 40) return 'ভাবি... এবার শেষ।';
  if (wave === 36) return 'আর মাত্র কয়েকটা...';
  if (wave === 37) return 'ভাবি, এখন কিন্তু পিছনে যাওয়া যাবে না।';
  if (wave === 38) return 'B Section শেষ চেষ্টা করছে।';
  if (wave === 39) return 'শেষ লড়াই সামনে।';
  if (wave % 10 === 0) return 'মিনি বস হাজির। এবার একটু সিরিয়াস হও!';
  if (wave >= 31) return 'পুরা B Section নামছে! 😭';
  if (wave >= 21) return 'এবার একটু বেশি আসবে।';
  if (wave >= 11) return 'ভাবি, প্রস্তুত?';
  return 'B Section আবার হাজির।';
};

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const inputRef = useRef({
    left: false,
    right: false,
    up: false,
    down: false,
    firing: false,
    pointerActive: false,
    pointerX: WORLD_WIDTH / 2,
    pointerY: WORLD_HEIGHT / 2,
  });

  const [hud, setHud] = useState<HudState>({
    score: 0,
    highScore: 0,
    wave: 1,
    combo: 0,
    statusMessage: 'খেলতে চাইলে শুরু করো, ভাবি!',
    bossHp: 0,
    bossMaxHp: 0,
    screen: 'menu',
    countdown: 3,
    enemyCount: 0,
    powerMode: 'READY',
    playerHp: PLAYER_MAX_HP,
    playerMaxHp: PLAYER_MAX_HP,
    powerUps: [],
  });
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [screenShake, setScreenShake] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [banglaComedy, setBanglaComedy] = useState(true);
  const [bestEndlessWave, setBestEndlessWave] = useState(0);
  const [bestEndlessScore, setBestEndlessScore] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(DEFAULT_LEADERBOARD);
  const [leaderboardTab, setLeaderboardTab] = useState<'campaign' | 'endless'>('campaign');
  const [playerName, setPlayerName] = useState(() => {
    try { return (window.localStorage.getItem(NAME_KEY) ?? window.localStorage.getItem('b-section-player-name'))?.trim() ?? ''; } catch { return ''; }
  });
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');
  const [nameRequired, setNameRequired] = useState(false);
  const [showControlsHint, setShowControlsHint] = useState(false);
  const [lastRecordId, setLastRecordId] = useState<string | null>(null);
  const [showHowTo, setShowHowTo] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [checkpointNotice, setCheckpointNotice] = useState(false);
  const settingsRef = useRef<SavedSettings>({ soundOn, musicOn, screenShake, reducedMotion, banglaComedy });
  settingsRef.current = { soundOn, musicOn, screenShake, reducedMotion, banglaComedy };
  const leaderboardRef = useRef(leaderboard);
  leaderboardRef.current = leaderboard;
  const bestRecordsRef = useRef({ wave: bestEndlessWave, score: bestEndlessScore });
  bestRecordsRef.current = { wave: bestEndlessWave, score: bestEndlessScore };

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioUnlockedRef = useRef(false);
  const musicTimerRef = useRef<number | null>(null);
  const gameRef = useRef<{
    state: Screen;
    countdown: number;
    score: number;
    highScore: number;
    combo: number;
    wave: number;
    waveAge: number;
    kills: number;
    totalKills: number;
    waveGoal: number;
    waveKills: number;
    bossActive: boolean;
    bossPhase: number;
    bossRageTimer: number;
    bossAddsSpawned: number;
    bossLowPause: number;
    bossLowDialogShown: boolean;
    bossLowDialogTimer: number;
    finalSequence: FinalSequence;
    finalSequenceTimer: number;
    finalDefeatHandled: boolean;
    rareEventTimer: number;
    rareEventText: string;
    commentaryTimer: number;
    eventCooldown: number;
    eventName: string;
    eventTimer: number;
    lakaMode: boolean;
    waveEventDone: boolean;
    pendingSpawns: SpawnOrder[];
    waveTransition: number;
    bestCombo: number;
    totalPlayTime: number;
    specialEvents: number;
    fastKillChain: number;
    fastKillTimer: number;
    backupUsed: boolean;
    shakeTimer: number;
    damageFlash: number;
    shockwaveTimer: number;
    endlessMode: boolean;
    spawnTimer: number;
    player: {
      x: number;
      y: number;
      w: number;
      h: number;
      speed: number;
      velocityX: number;
      velocityY: number;
      tilt: number;
      recoil: number;
      muzzleFlash: number;
      hp: number;
      maxHp: number;
      fireCooldown: number;
      shootRate: number;
      shieldTimer: number;
      rapidTimer: number;
      doubleTimer: number;
      boostTimer: number;
      megaTimer: number;
      invulnerable: number;
    };
    bullets: Bullet[];
    enemyBullets: Bullet[];
    enemies: Enemy[];
    particles: Particle[];
    powerUps: PowerUp[];
    floatingTexts: FloatingText[];
    statusMessage: string;
    bossHp: number;
    bossMaxHp: number;
    powerMode: string;
    difficulty: number;
  }>({
    state: 'menu',
    countdown: 3,
    score: 0,
    highScore: 0,
    combo: 0,
    wave: 1,
    waveAge: 0,
    kills: 0,
    totalKills: 0,
    waveGoal: 8,
    waveKills: 0,
    bossActive: false,
    bossPhase: 0,
    bossRageTimer: 0,
    bossAddsSpawned: 0,
    bossLowPause: 0,
    bossLowDialogShown: false,
    bossLowDialogTimer: 0,
    finalSequence: 'idle',
    finalSequenceTimer: 0,
    finalDefeatHandled: false,
    rareEventTimer: 36,
    rareEventText: 'সদাই টেনশন, ভাবি!',
    commentaryTimer: 0,
    eventCooldown: 24,
    eventName: '',
    eventTimer: 0,
    lakaMode: false,
    waveEventDone: false,
    pendingSpawns: [],
    waveTransition: 0,
    bestCombo: 0,
    totalPlayTime: 0,
    specialEvents: 0,
    fastKillChain: 0,
    fastKillTimer: 0,
    backupUsed: false,
    shakeTimer: 0,
    damageFlash: 0,
    shockwaveTimer: 0,
    endlessMode: false,
    spawnTimer: 0.5,
    player: {
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT - 80,
      w: 38,
      h: 24,
      speed: 280,
      velocityX: 0,
      velocityY: 0,
      tilt: 0,
      recoil: 0,
      muzzleFlash: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      fireCooldown: 0,
      shootRate: 0.22,
      shieldTimer: 0,
      rapidTimer: 0,
      doubleTimer: 0,
      boostTimer: 0,
      megaTimer: 0,
      invulnerable: 0,
    },
    bullets: [],
    enemyBullets: [],
    enemies: [],
    particles: [],
    powerUps: [],
    floatingTexts: [],
    statusMessage: 'খেলতে চাইলে শুরু করো, ভাবি!',
    bossHp: 0,
    bossMaxHp: 0,
    powerMode: 'READY',
    difficulty: 1,
  });

  const lastHudSyncRef = useRef(0);

  const syncHud = () => {
    const state = gameRef.current;
    const now = performance.now();
    if (state.state === 'playing' && now - lastHudSyncRef.current < 100) return;
    lastHudSyncRef.current = now;
    setHud({
      score: state.score,
      highScore: Math.max(state.highScore, state.score),
      wave: state.wave,
      combo: state.combo,
      statusMessage: state.statusMessage,
      bossHp: state.bossHp,
      bossMaxHp: state.bossMaxHp,
      screen: state.state,
      countdown: state.countdown,
      enemyCount: state.enemies.length,
      powerMode: normalizePowerMode(Math.max(state.player.rapidTimer, state.player.doubleTimer, state.player.boostTimer, state.player.shieldTimer, state.player.megaTimer)),
      playerHp: state.player.hp,
      playerMaxHp: state.player.maxHp,
      powerUps: ([
        { key: 'rapid', icon: '⚡', label: 'RAPID FIRE', time: state.player.rapidTimer, color: '#ffd166' },
        { key: 'double', icon: '✦', label: 'DOUBLE SHOT', time: state.player.doubleTimer, color: '#ff9f7f' },
        { key: 'shield', icon: '◉', label: 'SHIELD', time: state.player.shieldTimer, color: '#7de8f7' },
        { key: 'mega', icon: '✹', label: 'MEGA SHOT', time: state.player.megaTimer, color: '#ff8fab' },
        { key: 'boost', icon: '➤', label: 'SPEED', time: state.player.boostTimer, color: '#a981ff' },
      ] as const).filter((power) => power.time > 0).map((power) => ({ ...power, time: Math.ceil(power.time) })),
    });
  };

  const updateStorage = () => {
    const state = gameRef.current;
    const current = readStorage();
    const nextHigh = state.endlessMode ? current.highScore : Math.max(state.highScore, current.highScore, state.score);
    const next = {
      highScore: nextHigh,
      bestCampaignCombo: current.bestCampaignCombo,
      bestEndlessWave: Math.max(bestRecordsRef.current.wave, current.bestEndlessWave),
      bestEndlessScore: Math.max(bestRecordsRef.current.score, current.bestEndlessScore),
      leaderboard: leaderboardRef.current,
      settings: settingsRef.current,
    };
    writeStorage(next);
  };

  const ensureAudio = () => {
    if (typeof window === 'undefined' || !audioUnlockedRef.current) return null;
    try {
      if (!audioContextRef.current) {
        const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtor) return null;
        audioContextRef.current = new AudioCtor();
      }
      if (audioContextRef.current.state === 'suspended') {
        void audioContextRef.current.resume().catch(() => undefined);
      }
      return audioContextRef.current;
    } catch {
      return null;
    }
  };

  const playTone = (frequency: number, duration: number, type: OscillatorType = 'square', volume: number = 0.04) => {
    if (!settingsRef.current.soundOn) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gainNode.gain.value = volume;
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.stop(ctx.currentTime + duration);
  };

  const playExplosion = (intensity = 1) => {
    const gain = 0.05 * intensity;
    playTone(120, 0.12, 'sawtooth', gain);
    setTimeout(() => playTone(60, 0.14, 'square', gain * 0.8), 40);
  };

  const spawnParticles = (x: number, y: number, color: string, amount: number, spread = 2.2) => {
    const state = gameRef.current;
    const particleCount = Math.min(settingsRef.current.reducedMotion ? Math.ceil(amount * 0.2) : amount, Math.max(0, 700 - state.particles.length));
    for (let i = 0; i < particleCount; i += 1) {
      state.particles.push({
        x,
        y,
        vx: randomBetween(-80, 80) * spread,
        vy: randomBetween(-80, 80) * spread,
        life: randomBetween(0.3, 0.8),
        maxLife: randomBetween(0.3, 0.8),
        color,
        radius: randomBetween(2, 5),
      });
    }
  };

  const createEnemy = (type: EnemyType): Enemy => {
    const baseX = randomBetween(80, WORLD_WIDTH - 80);
    const baseY = randomBetween(40, 140);
    const common = {
      id: Math.random() * 1000000,
      type,
      x: baseX,
      y: baseY,
      w: 26,
      h: 26,
      hp: 1,
      maxHp: 1,
      vx: randomBetween(-50, 50),
      vy: randomBetween(40, 90),
      shootCooldown: randomBetween(0.8, 2.5),
      cooldown: randomBetween(0.6, 1.6),
      points: 100,
      direction: Math.random() > 0.5 ? 1 : -1,
      phase: randomBetween(0, Math.PI * 2),
      taunt: randomTaunt(),
    };

    if (type === 'basic') {
      const hp = 1 + Math.floor(gameRef.current.wave / 8);
      return { ...common, w: 26, h: 26, hp, maxHp: hp, vx: randomBetween(-70, 70), vy: 90 + gameRef.current.wave * 5, points: 100 };
    }
    if (type === 'swarm') {
      return { ...common, w: 22, h: 22, hp: 1, maxHp: 1, vx: randomBetween(-110, 110), vy: 110 + gameRef.current.wave * 10, points: 250 };
    }
    if (type === 'bomber') {
      const hp = 4 + Math.floor(gameRef.current.wave * 0.35);
      return { ...common, w: 42, h: 36, hp, maxHp: hp, vx: randomBetween(-45, 45), vy: 75 + gameRef.current.wave * 4, points: 500, shootCooldown: 1.5 };
    }
    if (type === 'speedster') {
      return { ...common, w: 22, h: 22, hp: 2, maxHp: 2, vx: randomBetween(-220, 220), vy: 140 + gameRef.current.wave * 12, points: 750, taunt: 'এদিকে আসো!' };
    }
    if (type === 'runner') {
      return { ...common, w: 24, h: 24, hp: 2 + Math.floor(gameRef.current.wave / 5), maxHp: 2 + Math.floor(gameRef.current.wave / 5), vx: randomBetween(-180, 180), vy: 110 + gameRef.current.wave * 12, points: 500, isRunner: true, taunt: 'এইটা পরে আসি! 🏃' };
    }
    if (type === 'vip') {
      const hp = 12 + gameRef.current.wave;
      return { ...common, w: 36, h: 36, hp, maxHp: hp, vx: randomBetween(-50, 50), vy: 72 + gameRef.current.wave * 4, points: 1400, taunt: 'VIP কে মারলা?! 😭' };
    }
    return {
      ...common,
      w: 120,
      h: 90,
      hp: 140 + gameRef.current.wave * 18,
      maxHp: 140 + gameRef.current.wave * 18,
      vx: 0,
      vy: 40,
      points: 5000,
      shootCooldown: 1.2,
      cooldown: 1.8,
      direction: 1,
      phase: 0,
      taunt: 'এতদূর আসছো?'
    };
  };

  const spawnPowerUp = (x: number, y: number) => {
    const state = gameRef.current;
    const types: PowerUpType[] = ['double', 'rapid', 'shield', 'mega', 'clear', 'boost'];
    if (state.player.hp < state.player.maxHp * 0.62 && Math.random() < 0.2) types.push('repair');
    const type = types[Math.floor(Math.random() * types.length)];
    gameRef.current.powerUps.push({ type, x, y, r: 14, vy: 90 });
  };

  const spawnWave = (wave: number) => {
    const state = gameRef.current;
    state.eventName = '';
    state.eventTimer = 0;
    state.lakaMode = false;
    state.eventCooldown = Math.max(state.eventCooldown, 22);
    const enemyCount = wave === 40 && !state.endlessMode ? 0 : 6 + Math.min(wave, 33) * 2;
    const types: EnemyType[] = ['basic', 'basic', 'basic', 'swarm', 'swarm', 'speedster'];
    if (wave >= 6) types.push('runner');
    if (wave >= 12) types.push('bomber');
    if (wave >= 16) types.push('vip');

    const formation = wave % 6;
    state.pendingSpawns = Array.from({ length: enemyCount }, (_, index) => {
      const formationIndex = index % 8;
      const row = Math.floor(index / 8);
      let offsetX = (formationIndex % 4 - 1.5) * 42;
      let offsetY = row * -42;
      if (formation === 1) offsetX = (formationIndex % 2 ? 1 : -1) * (24 + Math.floor(formationIndex / 2) * 30);
      if (formation === 2) offsetX = Math.sin(formationIndex * 0.8) * 88;
      if (formation === 3) offsetX = formationIndex * 44 - 154;
      if (formation === 4) {
        offsetX = Math.cos(formationIndex * (Math.PI * 2 / 8)) * 72;
        offsetY += Math.sin(formationIndex * (Math.PI * 2 / 8)) * 32 - 50;
      }
      if (formation === 5) {
        offsetX = randomBetween(-240, 240);
        offsetY += randomBetween(-50, 70);
      }
      const edgeEntry: SpawnEntry | undefined = index % 11 === 7
        ? (index % 2 ? 'left' : 'right')
        : index % 13 === 9 ? 'diagonal' : undefined;
      return {
        type: index % 9 === 6 && wave >= 12 ? 'bomber' : types[Math.floor(Math.random() * types.length)],
        entry: edgeEntry ?? 'top',
        offsetX,
        offsetY,
      };
    });
    state.spawnTimer = wave >= 36 && wave <= 39 ? 1.1 : 0.4;
    state.waveTransition = 0;
    state.waveAge = 0;
    state.waveEventDone = false;
    state.backupUsed = false;
    state.statusMessage = !settingsRef.current.banglaComedy ? (state.endlessMode && wave > 40 ? `B SECTION NEVER ENDS - WAVE ${wave}` : `WAVE ${String(wave).padStart(2, '0')} READY`) : state.endlessMode && wave > 40
      ? `B SECTION NEVER ENDS 😭 · WAVE ${wave}`
      : `${getCampaignTitle(wave)} · WAVE ${String(wave).padStart(2, '0')} / 40 · ${getWaveSubtitle(wave)}`;
    state.commentaryTimer = 1.2;
    if (wave > 1 && wave % 3 === 0 && wave < 40) {
      spawnPowerUp(randomBetween(140, WORLD_WIDTH - 140), 100);
    }

    if (wave === 40) {
      state.enemies = [];
      state.enemyBullets = [];
      state.pendingSpawns = [];
      state.bossActive = false;
      state.bossHp = 0;
      state.bossMaxHp = 0;
      state.finalSequence = 'quiet';
      state.finalSequenceTimer = 1;
      state.statusMessage = '';
      state.powerUps.push({ type: 'shield', x: state.player.x, y: state.player.y - 82, r: 15, vy: 48 });
    } else if (wave % 10 === 0 && !state.bossActive) {
      const boss = createEnemy('boss');
      boss.x = WORLD_WIDTH / 2;
      boss.y = -70;
      boss.w = 112;
      boss.h = 82;
      boss.hp = 180 + wave * 3;
      boss.maxHp = boss.hp;
      boss.vy = 36;
      state.enemies.push(boss);
      state.bossActive = true;
      state.bossPhase = 1;
      state.bossRageTimer = 0;
      state.bossAddsSpawned = 0;
      state.bossHp = boss.hp;
      state.bossMaxHp = boss.maxHp;
      state.statusMessage = wave === 10 ? 'বি সেকশনের ডেপুটি হাজির!' : 'মিনি বস হাজির, ভাবি!';
      playExplosion(2);
    }
  };

  const spawnFinalBoss = () => {
    const state = gameRef.current;
    const boss = createEnemy('boss');
    boss.x = WORLD_WIDTH / 2;
    boss.y = -90;
    boss.w = 184;
    boss.h = 124;
    boss.hp = 650;
    boss.maxHp = 650;
    boss.vx = 0;
    boss.vy = 44;
    boss.shootCooldown = 1.4;
    boss.points = 24000;
    boss.taunt = 'বি সেকশনের বড় ভাই';
    state.enemies = [boss];
    state.bossActive = true;
    state.bossPhase = 1;
    state.bossRageTimer = 0;
    state.bossAddsSpawned = 0;
    state.bossLowPause = 0;
    state.bossLowDialogShown = false;
    state.bossLowDialogTimer = 0;
    state.bossHp = boss.hp;
    state.bossMaxHp = boss.maxHp;
    state.finalSequence = 'boss-entry';
    state.finalSequenceTimer = 1.15;
    state.statusMessage = 'THE FINAL B';
    playExplosion(2.2);
  };

  const triggerWaveCommentary = (wave: number) => {
    const state = gameRef.current;
    state.commentaryTimer = 1.6;
    state.statusMessage = getWaveCommentary(wave);
    syncHud();
  };

  const restoreCheckpoint = (wave: number) => {
    const state = gameRef.current;
    const bonus = Math.ceil(state.player.maxHp * 0.28);
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + bonus);
    state.player.shieldTimer = 4;
    spawnPowerUp(state.player.x, state.player.y - 84);
    state.score += 800 + wave * 50;
    state.statusMessage = settingsRef.current.banglaComedy ? getCheckpointText(wave) : 'CHECKPOINT COMPLETE';
    state.commentaryTimer = 1.8;
    setCheckpointNotice(true);
    window.setTimeout(() => setCheckpointNotice(false), 1400);
    playTone(540, 0.14, 'triangle', 0.035);
    syncHud();
  };

  const finishVictory = () => {
    const state = gameRef.current;
    state.state = 'victory';
    state.statusMessage = 'CAMPAIGN COMPLETE! 🏆';
    state.bossActive = false;
    state.enemies = [];
    state.pendingSpawns = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.powerUps = [];
    state.particles = [];
    state.floatingTexts = [];
    state.eventName = '';
    state.eventTimer = 0;
    state.lakaMode = false;
    state.bossHp = 0;
    state.bossMaxHp = 0;
    state.finalSequence = 'idle';
    state.player.x = WORLD_WIDTH / 2;
    state.player.velocityX = 0;
    state.player.velocityY = 0;

    const summary: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: playerNameRef.current.trim() || 'Player',
      score: Math.max(state.score, 0),
      wave: Math.max(state.wave, 40),
      date: new Date().toISOString().slice(0, 10),
      duration: Math.round(state.totalPlayTime),
      bestCombo: state.bestCombo,
      mode: 'campaign' as const,
    };

    setLastRecordId(summary.id ?? null);
    const updatedLeaderboard = [...leaderboardRef.current, summary].sort((a, b) => b.score - a.score || b.wave - a.wave || (b.bestCombo ?? 0) - (a.bestCombo ?? 0)).slice(0, 20);
    setLeaderboard(updatedLeaderboard);
    const saved = readStorage();
    writeStorage({
      highScore: Math.max(saved.highScore, summary.score),
      bestCampaignCombo: Math.max(saved.bestCampaignCombo, state.bestCombo),
      bestEndlessWave: Math.max(saved.bestEndlessWave, bestRecordsRef.current.wave),
      bestEndlessScore: Math.max(saved.bestEndlessScore, bestRecordsRef.current.score),
      leaderboard: updatedLeaderboard,
      settings: settingsRef.current,
    });
    playExplosion(3.2);
    setHud((prev) => ({ ...prev, screen: 'victory', statusMessage: 'CAMPAIGN COMPLETE! 🏆' }));
    syncHud();
  };

  const resetGame = () => {
    const state = gameRef.current;
    state.state = 'countdown';
    state.countdown = 2.85;
    state.score = 0;
    state.combo = 0;
    state.wave = 1;
    state.waveAge = 0;
    setCheckpointNotice(false);
    state.kills = 0;
    state.totalKills = 0;
    state.waveGoal = 8;
    state.waveKills = 0;
    state.bossActive = false;
    state.spawnTimer = 0.6;
    state.pendingSpawns = [];
    state.waveTransition = 0;
    state.bestCombo = 0;
    state.totalPlayTime = 0;
    state.endlessMode = false;
    state.specialEvents = 0;
    state.fastKillChain = 0;
    state.fastKillTimer = 0;
    state.backupUsed = false;
    state.shakeTimer = 0;
    state.damageFlash = 0;
    state.shockwaveTimer = 0;
    state.finalSequence = 'idle';
    state.finalSequenceTimer = 0;
    state.finalDefeatHandled = false;
    state.bossLowPause = 0;
    state.bossLowDialogShown = false;
    state.bossLowDialogTimer = 0;
    state.bossAddsSpawned = 0;
    state.player = {
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT - 80,
      w: 38,
      h: 24,
      speed: 280,
      velocityX: 0,
      velocityY: 0,
      tilt: 0,
      recoil: 0,
      muzzleFlash: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      fireCooldown: 0,
      shootRate: 0.22,
      shieldTimer: 0,
      rapidTimer: 0,
      doubleTimer: 0,
      boostTimer: 0,
      megaTimer: 0,
      invulnerable: 0,
    };
    state.bullets = [];
    gameRef.current.endlessMode = false;
    gameRef.current.endlessMode = false;
    state.enemyBullets = [];
    state.particles = [];
    state.powerUps = [];
    state.floatingTexts = [];
    state.enemies = [];
    state.statusMessage = 'READY?';
    state.bossHp = 0;
    state.bossMaxHp = 0;
    state.powerMode = 'READY';
    state.difficulty = 1;
    state.rareEventTimer = 36;
    state.rareEventText = 'সদাই টেনশন, ভাবি!';
    state.commentaryTimer = 0;
    state.eventCooldown = 24;
    state.eventName = '';
    state.eventTimer = 0;
    state.lakaMode = false;
    setHud((prev) => ({ ...prev, screen: 'countdown', countdown: 3, statusMessage: state.statusMessage }));
    syncHud();
  };

  const setGameOver = (message = 'আজকে আর পারলাম না 😭') => {
    const state = gameRef.current;
    state.state = 'gameover';
    state.statusMessage = message;
    const current = readStorage();
    const nextHigh = state.endlessMode ? current.highScore : Math.max(current.highScore, state.score);
    Object.assign(inputRef.current, { left: false, right: false, up: false, down: false, firing: false, pointerActive: false });
    const nextEndlessScore = state.endlessMode ? Math.max(current.bestEndlessScore, state.score) : Math.max(current.bestEndlessScore, bestRecordsRef.current.score);
    const nextEndlessWave = state.endlessMode ? Math.max(current.bestEndlessWave, state.wave) : Math.max(current.bestEndlessWave, bestRecordsRef.current.wave);
    const entry: LeaderboardEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: playerNameRef.current.trim() || 'Player',
      score: state.score,
      wave: state.wave,
      date: new Date().toISOString().slice(0, 10),
      duration: Math.round(state.totalPlayTime),
      bestCombo: state.bestCombo,
      mode: state.endlessMode ? 'endless' : 'campaign',
    };
    setLastRecordId(entry.id ?? null);
    const nextLeaderboard = [...leaderboardRef.current, entry].sort((a, b) => b.score - a.score || b.wave - a.wave || (b.bestCombo ?? 0) - (a.bestCombo ?? 0)).slice(0, 20);
    setLeaderboard(nextLeaderboard);
    setBestEndlessScore(nextEndlessScore);
    setBestEndlessWave(nextEndlessWave);
    writeStorage({
      highScore: nextHigh,
      bestCampaignCombo: Math.max(current.bestCampaignCombo, state.endlessMode ? 0 : state.bestCombo),
      bestEndlessWave: nextEndlessWave,
      bestEndlessScore: nextEndlessScore,
      leaderboard: nextLeaderboard,
      settings: settingsRef.current,
    });
    state.enemies = [];
    state.pendingSpawns = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.powerUps = [];
    state.particles = [];
    state.floatingTexts = [];
    state.eventName = '';
    state.eventTimer = 0;
    state.lakaMode = false;
    state.eventCooldown = 0;
    state.rareEventTimer = 0;
    state.bossActive = false;
    state.bossHp = 0;
    state.bossMaxHp = 0;
    state.damageFlash = 0;
    state.bossRageTimer = 0;
    state.bossLowPause = 0;
    state.bossLowDialogTimer = 0;
    state.finalSequence = 'idle';
    state.finalSequenceTimer = 0;
    state.highScore = nextHigh;
    syncHud();
    playExplosion(2.5);
  };

  const applyPowerUp = (type: PowerUpType) => {
    const state = gameRef.current;
    if (type === 'double') {
      state.player.doubleTimer = 8;
      state.statusMessage = 'ডাবল হামলা, ভাবি!';
    }
    if (type === 'rapid') {
      state.player.rapidTimer = 7;
      state.player.shootRate = 0.08;
      state.statusMessage = 'গুলি থামবে না।';
    }
    if (type === 'shield') {
      state.player.shieldTimer = 8;
      state.statusMessage = 'এখন লাগিয়ে দেখ।';
    }
    if (type === 'mega') {
      state.player.megaTimer = 8;
      state.statusMessage = 'এবার হিসাব হবে।';
    }
    if (type === 'clear') {
      state.enemies.forEach((enemy) => {
        emitDamage(enemy, 9999, true);
      });
      state.statusMessage = 'সবাই বিদায়।';
      playTone(300, 0.2, 'triangle', 0.06);
    }
    if (type === 'boost') {
      state.player.boostTimer = 7;
      state.player.speed = 360;
      state.statusMessage = 'ভাবি, উড়ো!';
    }
    if (type === 'repair') {
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + Math.ceil(state.player.maxHp * 0.24));
      state.statusMessage = 'ভাবি, একটু repair হয়ে গেলো। 😌';
    }
    if (!settingsRef.current.banglaComedy) state.statusMessage = `${type.toUpperCase()} POWER ACTIVE`;
    state.powerMode = normalizePowerMode(Math.max(state.player.rapidTimer, state.player.doubleTimer, state.player.boostTimer, state.player.shieldTimer, state.player.megaTimer));
    playTone(600, 0.12, 'triangle', 0.05);
  };

  const emitDamage = (enemy: Enemy, amount: number, skipParticles = false) => {
    const state = gameRef.current;
    if (enemy.isFakeDead) {
      enemy.isFakeDead = false;
      enemy.isRunner = true;
      enemy.vx = randomBetween(-100, 100);
      enemy.vy = -Math.max(100, Math.abs(enemy.vy) * 1.5);
      state.statusMessage = 'মরা সাজছিল! ধরে ফেলো! 🏃';
    }
    enemy.hitFlash = 0.12;
    enemy.hp -= amount;
    if (enemy.type === 'boss') {
      state.bossHp = Math.max(0, enemy.hp);
    }
    if (!skipParticles) {
      spawnParticles(enemy.x, enemy.y, '#ff4d88', 12, 2.8);
      if (enemy.hp > 0) playTone(300, 0.035, 'triangle', 0.012);
    }
    if (enemy.hp <= 0) {
      const isBoss = enemy.type === 'boss';
      const isFinalBoss = isBoss && state.wave === 40 && !state.endlessMode;
      const blast = isBoss ? 82 : enemy.type === 'bomber' ? 34 : enemy.type === 'speedster' ? 11 : 18;
      spawnParticles(enemy.x, enemy.y, isBoss ? '#ffd166' : enemy.type === 'bomber' ? '#ff9a62' : '#ff7fa3', blast, isBoss ? 5 : 3.2);
      state.score += enemy.points + state.combo * 25;
      state.combo += 1;
      state.totalKills += 1;
      state.waveKills += 1;
      state.kills += 1;
      state.statusMessage = isBoss ? 'বি সেকশন পুড়ল, ভাবি!' : randomMessage();
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      const popupPoints = isFinalBoss ? 10000 : isBoss ? 1000 : enemy.type === 'basic' ? 100 : 250;
      state.floatingTexts.push({ x: enemy.x, y: enemy.y, text: `+${popupPoints.toLocaleString()}`, color: isBoss ? '#ffd166' : '#e9fbff', life: 1.05, maxLife: 1.05 });
      if (state.floatingTexts.length > 24) state.floatingTexts.splice(0, state.floatingTexts.length - 24);
      const comboMilestones: Record<number, string> = { 5: 'শুরু হলো!', 10: 'ভাবি, aim ভালোই!', 25: 'আজকে তো অন্য level!', 50: 'LEGENDARY MODE 🔥', 100: 'LEGENDARY!' };
      const comboLine = comboMilestones[state.combo];
      if (comboLine) {
        if (settingsRef.current.banglaComedy) state.floatingTexts.push({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT * 0.36, text: comboLine, color: state.combo >= 50 ? '#ffd166' : '#91f1ff', life: 1.5, maxLife: 1.5 });
        if (settingsRef.current.banglaComedy) state.statusMessage = comboLine;
        playTone(state.combo >= 50 ? 740 : 520, 0.16, 'triangle', 0.045);
      }
      state.fastKillChain = state.fastKillTimer > 0 ? state.fastKillChain + 1 : 1;
      state.fastKillTimer = 3.2;
      if (state.fastKillChain >= 6 && !state.backupUsed && state.wave >= 16 && !state.bossActive) {
        state.backupUsed = true;
        state.specialEvents += 1;
        state.statusMessage = 'Backup ডাকো! · BACKUP INCOMING';
        for (let index = 0; index < 4; index += 1) {
          const backup = createEnemy(index % 2 ? 'swarm' : 'speedster');
          backup.x = 110 + index * 220;
          backup.y = -30 - index * 24;
          state.enemies.push(backup);
        }
      }
      if (isBoss) {
        spawnPowerUp(enemy.x, enemy.y);
      }
      state.enemies = state.enemies.filter((item) => item.id !== enemy.id);
      if (isBoss) {
        state.bossHp = 0;
        state.bossMaxHp = 0;
        state.score += 5000;
        state.shockwaveTimer = isFinalBoss ? 1.4 : 0.7;
        state.shakeTimer = settingsRef.current.screenShake && !settingsRef.current.reducedMotion ? (isFinalBoss ? 0.9 : 0.5) : 0;
        if (isFinalBoss && !state.finalDefeatHandled) {
          state.finalDefeatHandled = true;
          state.finalSequence = 'defeat';
          state.finalSequenceTimer = 0.72;
          state.statusMessage = 'শেষ আঘাত!';
          state.bossActive = false;
          state.enemies = [];
          state.pendingSpawns = [];
          state.enemyBullets = [];
          state.bullets = [];
          state.eventName = '';
          state.eventTimer = 0;
          state.lakaMode = false;
        } else {
          state.bossActive = false;
          state.statusMessage = isFinalBoss ? 'শেষ আঘাত!' : 'বি সেকশন হাল্কা ফাঁস, ভাবি!';
        }
        playExplosion(isFinalBoss ? 5 : 3);
      }
      if (Math.random() < 0.65) {
        playTone(360 + Math.random() * 180, 0.14, 'square', 0.04);
      }
    }
    state.highScore = Math.max(state.highScore, state.score);
    syncHud();
  };

  const shootPlayerBullet = () => {
    const state = gameRef.current;
    const player = state.player;
    if (player.fireCooldown > 0) return;
    const bulletSpeed = player.megaTimer > 0 ? 650 : 520;
    const damage = player.doubleTimer > 0 ? 2 : 1;
    const spread = player.megaTimer > 0 ? 0.14 : 0;
    state.bullets.push({
      x: player.x,
      y: player.y - player.h / 2,
      r: player.megaTimer > 0 ? 7 : 4,
      vx: Math.sin(spread) * 40,
      vy: -bulletSpeed,
      damage,
      enemy: false,
      color: player.megaTimer > 0 || player.rapidTimer > 0 ? '#ffd166' : '#6ee7ff',
    });
    if (player.doubleTimer > 0) {
      state.bullets.push({
        x: player.x - 12,
        y: player.y - player.h / 2,
        r: 4,
        vx: -20,
        vy: -bulletSpeed,
        damage,
        enemy: false,
        color: '#6ee7ff',
      });
      state.bullets.push({
        x: player.x + 12,
        y: player.y - player.h / 2,
        r: 4,
        vx: 20,
        vy: -bulletSpeed,
        damage,
        enemy: false,
        color: '#6ee7ff',
      });
    }
    player.fireCooldown = player.rapidTimer > 0 ? 0.09 : player.shootRate;
    player.recoil = 3;
    player.muzzleFlash = 0.1;
    spawnParticles(player.x, player.y - player.h / 2, '#6ee7ff', 2, 0.35);
    playTone(700, 0.05, 'square', 0.025);
  };

  const isGameOver = () => gameRef.current.state === 'gameover';

  const updateGame = (delta: number) => {
    const state = gameRef.current;
    const player = state.player;

    if (state.state === 'countdown') {
      state.countdown -= delta;
      const next = Math.ceil(state.countdown);
      if (next >= 1 && next !== (Math.ceil(state.countdown + delta))) {
        playTone(440 + next * 60, 0.11, 'triangle', 0.04);
      }
      if (state.countdown <= 0) {
        state.state = 'playing';
        spawnWave(1);
        state.statusMessage = settingsRef.current.banglaComedy ? 'B SECTION INCOMING' : 'B SECTION INCOMING';
        setHud((prev) => ({ ...prev, screen: 'playing', statusMessage: state.statusMessage }));
      }
      syncHud();
      return;
    }

    if (state.state !== 'playing') return;
    state.totalPlayTime += delta;
    state.waveAge += delta;

    if (state.finalSequence !== 'idle' && state.finalSequence !== 'active') {
      state.finalSequenceTimer = Math.max(0, state.finalSequenceTimer - delta);
      if (state.finalSequence === 'defeat') {
        state.shockwaveTimer = Math.max(0, state.shockwaveTimer - delta);
        state.particles.forEach((particle) => {
          particle.x += particle.vx * delta * 0.2;
          particle.y += particle.vy * delta * 0.2;
          particle.life -= delta * 0.2;
        });
        state.particles = state.particles.filter((particle) => particle.life > 0);
      }
      if (state.finalSequenceTimer <= 0) {
        if (state.finalSequence === 'quiet') {
          state.finalSequence = 'intro';
          state.finalSequenceTimer = 0.55;
          state.statusMessage = 'ভাবি...';
        } else if (state.finalSequence === 'intro') {
          state.finalSequence = 'entering';
          state.finalSequenceTimer = 0.7;
          state.statusMessage = 'এবার শেষ।';
        } else if (state.finalSequence === 'entering') {
          spawnFinalBoss();
        } else if (state.finalSequence === 'boss-entry') {
          state.finalSequence = 'active';
          state.statusMessage = 'বি সেকশনের বড় ভাই';
        } else if (state.finalSequence === 'defeat') {
          state.finalSequence = 'silence';
          state.finalSequenceTimer = 1;
          state.statusMessage = '';
        } else if (state.finalSequence === 'silence') {
          state.finalSequence = 'last-word';
          state.finalSequenceTimer = 0.7;
          state.statusMessage = 'শেষ।';
        } else if (state.finalSequence === 'last-word') {
          state.finalSequence = 'victory-approach';
          state.finalSequenceTimer = 0.85;
        } else if (state.finalSequence === 'victory-approach') {
          state.player.x += (WORLD_WIDTH / 2 - state.player.x) * Math.min(1, delta * 3.4);
          state.player.y += (WORLD_HEIGHT * 0.57 - state.player.y) * Math.min(1, delta * 3.4);
          if (state.finalSequenceTimer <= 0) {
            finishVictory();
          }
        }
      }
      syncHud();
      return;
    }

    if (state.commentaryTimer > 0) {
      state.commentaryTimer = Math.max(0, state.commentaryTimer - delta);
    }

    state.rareEventTimer -= delta;
    state.eventCooldown = Math.max(0, state.eventCooldown - delta);
    state.eventTimer = Math.max(0, state.eventTimer - delta);
    state.fastKillTimer = Math.max(0, state.fastKillTimer - delta);
    state.shakeTimer = Math.max(0, state.shakeTimer - delta);
    state.shockwaveTimer = Math.max(0, state.shockwaveTimer - delta);
    state.bossLowPause = Math.max(0, state.bossLowPause - delta);
    state.bossLowDialogTimer = Math.max(0, state.bossLowDialogTimer - delta);
    state.damageFlash = Math.max(0, state.damageFlash - delta);

    if (settingsRef.current.banglaComedy && state.eventCooldown <= 0 && state.wave < 40 && !state.bossActive && !state.lakaMode && !state.eventName && !state.waveEventDone && (state.enemies.length > 0 || state.pendingSpawns.length > 0)) {
      const roll = Math.random();
      state.eventCooldown = randomBetween(22, 38);
      state.waveEventDone = true;
      if (roll < 0.16) {
        state.statusMessage = 'B SECTION MEETING';
        state.eventName = 'meeting';
        state.eventTimer = 2.4;
        state.specialEvents += 1;
        const circle = 5 + Math.min(8, Math.floor(state.wave / 3));
        for (let i = 0; i < circle; i += 1) {
          const enemy = createEnemy(i % 2 === 0 ? 'swarm' : 'basic');
          enemy.x = 150 + (i * 120) % 520;
          enemy.y = 90 + (i % 3) * 48;
          enemy.vx = 0;
          enemy.vy = 42;
          enemy.isMeeting = true;
          state.enemies.push(enemy);
        }
      } else if (roll < 0.32) {
        state.statusMessage = 'B SECTION TRAFFIC JAM';
        state.eventName = 'traffic';
        state.eventTimer = 2.8;
        state.specialEvents += 1;
        for (let i = 0; i < 7; i += 1) {
          const enemy = createEnemy('swarm');
          enemy.x = randomBetween(120, WORLD_WIDTH - 120);
          enemy.y = randomBetween(-30, 30);
          enemy.vx = randomBetween(-18, 18);
          enemy.vy = 120;
          enemy.isTrafficJammed = true;
          state.enemies.push(enemy);
        }
      } else if (roll < 0.48) {
        state.statusMessage = 'আমরা এত সহজে যাবো না!';
        state.eventName = 'protest';
        state.eventTimer = 2.5;
        state.specialEvents += 1;
        for (let i = 0; i < 5; i += 1) {
          const enemy = createEnemy('runner');
          enemy.x = 80 + i * 170;
          enemy.y = -10 - i * 20;
          enemy.vx = 24;
          enemy.vy = 110;
          state.enemies.push(enemy);
        }
      } else if (roll < 0.62 && state.wave >= 11 && state.wave <= 15) {
        state.eventName = 'attendance';
        state.eventTimer = 2.8;
        state.specialEvents += 1;
        state.statusMessage = 'B SECTION ATTENDANCE · Present: 32 · Absent: 0';
        for (let index = 0; index < 8; index += 1) {
          const attendee = createEnemy(index % 3 === 0 ? 'speedster' : 'basic');
          attendee.x = 110 + index * 96;
          attendee.y = -35 - Math.floor(index / 4) * 42;
          attendee.vx = 0;
          attendee.vy = 100;
          state.enemies.push(attendee);
        }
      } else if (roll < 0.72 && state.wave >= 26 && state.wave <= 30) {
        state.eventName = 'laka-warning';
        state.eventTimer = 0.8;
        state.specialEvents += 1;
        state.statusMessage = '⚠️ জরুরি অবস্থা';
      } else if (roll < 0.78 && state.wave >= 15) {
        state.statusMessage = 'ভাবি...';
        state.eventName = 'laka-intro';
        state.eventTimer = 0.5;
        state.specialEvents += 1;
      } else if (roll < 0.78) {
        const target = state.enemies.find((enemy) => enemy.type !== 'boss') ?? createEnemy('basic');
        if (!state.enemies.includes(target)) {
          target.x = randomBetween(100, WORLD_WIDTH - 100);
          target.y = 120;
          state.enemies.push(target);
        }
        target.isFakeDead = true;
        target.fakeDeadTimer = 1.5;
        target.vx = 0;
        target.vy = 0;
        spawnParticles(target.x, target.y, '#ffd166', 24, 2.6);
        playExplosion(1.2);
        state.eventName = 'fakeout';
        state.eventTimer = 1.5;
        state.statusMessage = 'B SECTION: “শেষ নিশ্বাস...” 😭';
        state.specialEvents += 1;
      } else if (roll < 0.86 && state.wave >= 6) {
        const wrongWay = createEnemy('runner');
        wrongWay.x = randomBetween(100, WORLD_WIDTH - 100);
        wrongWay.y = 120;
        wrongWay.entry = 'diagonal';
        wrongWay.vx = randomBetween(-30, 30);
        wrongWay.vy = -105;
        wrongWay.wrongWayTimer = 0.85;
        state.enemies.push(wrongWay);
        state.eventName = 'wrong-way';
        state.eventTimer = 0.9;
        state.specialEvents += 1;
        state.statusMessage = 'ওহ... ভুল দিক।';
      } else if (roll < 0.94 && state.wave >= 16) {
        const tiny = createEnemy('basic');
        tiny.w = 16;
        tiny.h = 16;
        tiny.hp = 1;
        tiny.maxHp = 1;
        tiny.points = 400;
        tiny.x = WORLD_WIDTH / 2;
        tiny.y = -20;
        tiny.vy = 54;
        state.enemies.push(tiny);
        state.eventName = 'one-b';
        state.eventTimer = 2;
        state.specialEvents += 1;
        state.statusMessage = 'আমি একাই যথেষ্ট।';
      } else if (roll < 0.98 && state.wave >= 8) {
        const confused = state.enemies.filter((enemy) => enemy.type !== 'boss').slice(0, 5);
        confused.forEach((enemy) => { enemy.vx *= -1; enemy.direction *= -1; });
        state.eventName = 'self-confusion';
        state.eventTimer = 1.6;
        state.specialEvents += 1;
        state.statusMessage = '\u098f\u0995\u099f\u09c1 \u09a6\u09be\u0981\u09a1\u09bc\u09be\u0993... \u0995\u09cb\u09a8\u09a6\u09bf\u0995\u09c7?';
      } else if (roll < 0.99 && state.wave >= 8) {
        state.enemies.filter((enemy) => enemy.type !== 'boss').slice(0, 4).forEach((enemy) => { enemy.isCelebrating = true; enemy.vx = 0; enemy.vy = 0; });
        state.eventName = 'celebration';
        state.eventTimer = 1.5;
        state.specialEvents += 1;
        state.statusMessage = 'B SECTION: TOO HAPPY TO DODGE!';
      } else if (state.wave >= 8 && Math.random() < 0.5) {
        const pickup = createEnemy('vip');
        pickup.x = WORLD_WIDTH / 2;
        pickup.y = 30;
        pickup.vy = 50;
        pickup.taunt = 'VIP কে মারলা?! 😭';
        state.enemies.push(pickup);
        state.eventName = 'vip';
        state.eventTimer = 1.6;
        state.statusMessage = 'B SECTION VIP';
        state.specialEvents += 1;
      }
    }

    if (state.eventName === 'laka-warning' && state.eventTimer <= 0) {
      state.eventName = 'laka-intro';
      state.eventTimer = 0.5;
      state.statusMessage = 'ভাবি...';
    }
    if (state.eventName === 'attendance' && state.eventTimer <= 0 && state.statusMessage.startsWith('B SECTION ATTENDANCE')) {
      state.statusMessage = 'দুর্ভাগ্যবশত সবাই এসেছে। 😭';
    }

    if (state.eventName === 'laka-intro' && state.eventTimer <= 0) {
      state.eventName = 'laka';
      state.eventTimer = 10;
      state.lakaMode = true;
      state.player.rapidTimer = 10;
      state.player.shieldTimer = 10;
      state.player.boostTimer = 10;
      state.player.megaTimer = 10;
      state.player.shootRate = 0.08;
      state.statusMessage = 'ভাবি, লাকা উঠাও!!! 😭🔥';
      const attackEntries: SpawnEntry[] = ['top', 'left', 'top', 'right', 'diagonal', 'top'];
      for (let i = 0; i < 12; i += 1) {
        const enemy = createEnemy(i % 3 === 0 ? 'speedster' : 'swarm');
        const entry = attackEntries[i % attackEntries.length];
        enemy.entry = entry;
        enemy.x = entry === 'left' ? -24 : entry === 'right' ? WORLD_WIDTH + 24 : randomBetween(50, WORLD_WIDTH - 50);
        enemy.y = entry === 'top' || entry === 'diagonal' ? -28 - i * 12 : randomBetween(160, 300);
        enemy.vx = entry === 'left' ? 140 : entry === 'right' ? -140 : entry === 'diagonal' ? 90 : enemy.vx;
        state.enemies.push(enemy);
      }
    }
    if (state.eventName === 'laka' && state.eventTimer <= 0) {
      state.lakaMode = false;
      state.eventName = '';
      state.statusMessage = 'লাকা উঠানো সফল! ✅';
    }
    if (state.rareEventTimer <= 0 && !state.bossActive && state.finalSequence === 'idle' && !state.lakaMode && !state.eventName) {
      state.rareEventTimer = randomBetween(54, 82);
      state.rareEventText = randomRareEvent();
      if (settingsRef.current.banglaComedy) state.statusMessage = state.rareEventText;
    }
    if (state.eventName && state.eventTimer <= 0 && !state.eventName.startsWith('laka')) state.eventName = '';


    if (state.bossActive) {
      state.bossRageTimer += delta;
      const bossHealthRatio = state.bossHp / Math.max(state.bossMaxHp, 1);
      const previousPhase = state.bossPhase;
      state.bossPhase = bossHealthRatio <= 0.2 ? 4 : bossHealthRatio <= 0.45 ? 3 : bossHealthRatio <= 0.7 ? 2 : 1;
      if (state.bossPhase !== previousPhase) {
        state.statusMessage = state.bossPhase === 2 ? 'ওরা সবাই আসো!' : state.bossPhase === 3 ? 'সব দিক সামলাও!' : 'শেষ চেষ্টা!';
      }
      if (state.wave === 40 && state.bossPhase === 1 && state.bossRageTimer < 0.05) {
        state.statusMessage = 'এতদূর আসছো?';
      } else if (state.wave === 40 && state.bossPhase === 1 && state.bossRageTimer > 5 && state.bossRageTimer < 5.05) {
        state.statusMessage = 'ভালোই খেলছো।';
      }
      if (state.wave === 40 && bossHealthRatio <= 0.2 && !state.bossLowDialogShown) {
        state.bossLowDialogShown = true;
        state.bossLowPause = 0.5;
        state.bossLowDialogTimer = 2.5;
        state.enemyBullets = [];
        state.statusMessage = 'একটু দাঁড়াও...';
      } else if (state.bossLowDialogShown && state.bossLowPause === 0 && state.statusMessage === 'একটু দাঁড়াও...') {
        state.statusMessage = 'HP এত কম কেন?! 😭';
      }
      const summonLimit = state.wave === 40 ? 5 : 3;
      if (state.bossRageTimer > 4 && state.bossPhase > 1 && state.bossAddsSpawned < summonLimit) {
        const burst = createEnemy('swarm');
        burst.x = randomBetween(60, WORLD_WIDTH - 60);
        burst.y = randomBetween(-40, 20);
        burst.shootCooldown = 999;
        state.enemies.push(burst);
        state.bossAddsSpawned += 1;
        state.bossRageTimer = 0;
      }
    }

    player.fireCooldown = Math.max(0, player.fireCooldown - delta);
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    player.shieldTimer = Math.max(0, player.shieldTimer - delta);
    player.rapidTimer = Math.max(0, player.rapidTimer - delta);
    player.doubleTimer = Math.max(0, player.doubleTimer - delta);
    player.boostTimer = Math.max(0, player.boostTimer - delta);
    player.megaTimer = Math.max(0, player.megaTimer - delta);
    if (player.boostTimer <= 0) {
      player.speed = 280;
    }
    if (player.rapidTimer <= 0) {
      player.shootRate = 0.22;
    }

    const moveX = (inputRef.current.right ? 1 : 0) - (inputRef.current.left ? 1 : 0);
    const moveY = (inputRef.current.down ? 1 : 0) - (inputRef.current.up ? 1 : 0);
    const length = Math.hypot(moveX, moveY) || 1;

    if (inputRef.current.pointerActive) {
      const targetX = clamp(inputRef.current.pointerX, player.w / 2, WORLD_WIDTH - player.w / 2);
      const targetY = clamp(inputRef.current.pointerY, WORLD_HEIGHT * 0.55, WORLD_HEIGHT - player.h / 2);
      const desiredX = targetX - player.x;
      const desiredY = targetY - player.y;
      player.velocityX = clamp(desiredX * 3.8, -player.speed, player.speed);
      player.velocityY = clamp(desiredY * 3.8, -player.speed, player.speed);
    }

    if (!inputRef.current.pointerActive) {
      const acceleration = Math.min(1, delta * 9);
      player.velocityX += (moveX / length * player.speed - player.velocityX) * acceleration;
      player.velocityY += (moveY / length * player.speed - player.velocityY) * acceleration;
    }
    player.x = clamp(player.x + player.velocityX * delta, 24, WORLD_WIDTH - 24);
    player.y = clamp(player.y + player.velocityY * delta, WORLD_HEIGHT * 0.55, WORLD_HEIGHT - 28);
    if (player.x === 24 || player.x === WORLD_WIDTH - 24) player.velocityX = 0;
    if (player.y === WORLD_HEIGHT * 0.6 || player.y === WORLD_HEIGHT - 28) player.velocityY = 0;
    player.tilt += (clamp(player.velocityX / player.speed, -1, 1) * 0.28 - player.tilt) * Math.min(1, delta * 10);
    player.recoil = Math.max(0, player.recoil - delta * 18);
    player.muzzleFlash = Math.max(0, player.muzzleFlash - delta);

    if (state.pendingSpawns.length > 0) {
      state.spawnTimer -= delta;
      if (state.spawnTimer <= 0) {
        const spawn = state.pendingSpawns.shift();
        if (spawn) {
          const enemy = createEnemy(spawn.type);
          enemy.entry = spawn.entry;
          enemy.x = WORLD_WIDTH / 2 + spawn.offsetX;
          enemy.y = -36 + spawn.offsetY;
          if (spawn.entry === 'left' || spawn.entry === 'diagonal') {
            enemy.x = -36;
            enemy.y = spawn.entry === 'left' ? randomBetween(150, 300) : -20;
            enemy.vx = spawn.entry === 'left' ? randomBetween(100, 180) : 120;
          } else if (spawn.entry === 'right') {
            enemy.x = WORLD_WIDTH + 36;
            enemy.y = randomBetween(150, 300);
            enemy.vx = -randomBetween(100, 180);
          }
          enemy.vy = Math.min(enemy.vy, 150);
          state.enemies.push(enemy);
          if (state.pendingSpawns.length > 12 && !state.eventName.startsWith('laka')) {
            state.statusMessage = 'ভাবি... এতজনের দরকার ছিল?';
          }
        }
        state.spawnTimer = state.wave >= 36 && state.wave <= 39 && state.waveAge < 4
          ? 1.1
          : Math.max(0.34, 0.62 - state.wave * 0.004);
      }
    }

    if (inputRef.current.firing) {
      shootPlayerBullet();
    }

    state.bullets.forEach((bullet) => {
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
    });
    state.enemyBullets.forEach((bullet) => {
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;
    });

    state.enemies.forEach((enemy) => {
      if (enemy.isFakeDead) {
        enemy.fakeDeadTimer = Math.max(0, (enemy.fakeDeadTimer ?? 0) - delta);
        if (enemy.fakeDeadTimer === 0) {
          enemy.isFakeDead = false;
          enemy.isRunner = true;
          enemy.vx = randomBetween(-100, 100);
          enemy.vy = -Math.max(100, Math.abs(enemy.vy) * 1.5);
          state.statusMessage = 'ভেবেছিলে শেষ? 😌';
        }
        return;
      }
      if (enemy.isCelebrating && state.eventTimer > 0) return;
      if (enemy.isCelebrating && state.eventTimer <= 0) { enemy.isCelebrating = false; enemy.vy = 95; }
      if (enemy.isMeeting && state.eventTimer > 0) return;
      if (enemy.isMeeting && state.eventTimer <= 0) {
        enemy.isMeeting = false;
        enemy.vy = 120;
        state.statusMessage = 'প্ল্যান সফল!';
      }
      if (enemy.isTrafficJammed && state.eventTimer > 0) return;
      if (enemy.isTrafficJammed && state.eventTimer <= 0) {
        enemy.isTrafficJammed = false;
        enemy.vx = randomBetween(-45, 45);
        enemy.vy = 125;
      }
      if (enemy.type === 'boss' && state.bossLowPause > 0) return;
      enemy.hitFlash = Math.max(0, (enemy.hitFlash ?? 0) - delta);
      enemy.wrongWayTimer = Math.max(0, (enemy.wrongWayTimer ?? 0) - delta);
      if (enemy.wrongWayTimer === 0 && enemy.entry === 'diagonal' && enemy.vy < 0) {
        enemy.vy = 90;
        enemy.vx = randomBetween(-60, 60);
        state.statusMessage = 'ওহ... ভুল দিক।';
      }
      enemy.phase += delta * 3;
      enemy.x += enemy.vx * delta;
      enemy.y += enemy.vy * delta;

      if (enemy.type === 'basic' || enemy.type === 'swarm') {
        enemy.x += Math.sin(enemy.phase) * 28 * delta;
      }
      if (enemy.type === 'speedster') {
        enemy.x += Math.sin(enemy.phase * 3) * 90 * delta;
        enemy.y += Math.sin(enemy.phase) * 35 * delta;
      }
      if (enemy.type === 'bomber') {
        enemy.y += Math.sin(enemy.phase * 2) * 22 * delta;
      }
      if (enemy.type === 'vip') {
        enemy.x += clamp(player.x - enemy.x, -36, 36) * delta;
      }
      if (enemy.type === 'boss') {
        const finalBoss = state.wave === 40;
        const phaseSpeed = state.bossPhase === 1 ? 0.6 : state.bossPhase === 2 ? 1.05 : state.bossPhase === 3 ? 1.5 : 1.9;
        const patrolWidth = finalBoss ? 235 : 180;
        enemy.x = clamp(WORLD_WIDTH / 2 + Math.sin(enemy.phase * phaseSpeed * 0.4) * patrolWidth, enemy.w / 2 + 12, WORLD_WIDTH - enemy.w / 2 - 12);
        enemy.y = Math.min(finalBoss ? 138 : 150, enemy.y + (finalBoss ? 38 : 32) * delta);
      }

      if ((enemy.x < 24 && enemy.vx < 0) || (enemy.x > WORLD_WIDTH - 24 && enemy.vx > 0)) {
        enemy.vx *= -1;
      }
      if (enemy.y > WORLD_HEIGHT - 40) {
        enemy.y = 40;
      }

      enemy.shootCooldown -= delta;
      if (enemy.shootCooldown <= 0 && (enemy.type === 'bomber' || enemy.type === 'boss') && !(enemy.type === 'boss' && state.bossLowPause > 0)) {
        const dxEnemy = player.x - enemy.x;
        const dyEnemy = player.y - enemy.y;
        const angle = Math.atan2(dyEnemy, dxEnemy);
        if (enemy.type === 'boss') {
          const phase = state.bossPhase;
          const spreadCount = phase === 1 ? 3 : phase === 2 ? 3 : phase === 3 ? 5 : 7;
          const spread = phase === 1 ? 0.22 : phase === 2 ? 0.34 : 0.82;
          const bulletSpeed = phase === 1 ? 175 : phase === 2 ? 215 : phase === 3 ? 250 : 280;
          for (let index = 0; index < spreadCount; index += 1) {
            const offset = (index / (spreadCount - 1) - 0.5) * spread;
            const shotAngle = angle + offset;
            state.enemyBullets.push({
              x: enemy.x,
              y: enemy.y + enemy.h / 2,
              r: phase >= 3 ? 7 : 6,
              vx: Math.cos(shotAngle) * bulletSpeed,
              vy: Math.sin(shotAngle) * bulletSpeed,
              damage: phase === 1 ? 12 : phase === 2 ? 15 : phase === 3 ? 18 : 20,
              enemy: true,
              color: phase >= 3 ? '#ff8f72' : '#ff6b6b',
            });
          }
          if (phase >= 3) {
            for (const side of [-1, 1]) {
              state.enemyBullets.push({
                x: enemy.x + side * enemy.w * 0.24,
                y: enemy.y + enemy.h / 2,
                r: 8,
                vx: side * 72,
                vy: 225,
                damage: 18,
                enemy: true,
                color: '#ffbc6e',
              });
            }
          }
          enemy.shootCooldown = phase === 1 ? 1.8 : phase === 2 ? 1.55 : phase === 3 ? 1.35 : 1.2;
        } else {
          const bulletSpeed = 220;
          state.enemyBullets.push({
            x: enemy.x,
            y: enemy.y + enemy.h / 2,
            r: 5,
            vx: Math.cos(angle) * bulletSpeed,
            vy: Math.sin(angle) * bulletSpeed,
            damage: enemy.type === 'bomber' ? 16 : 12,
            enemy: true,
            color: '#ff7eb6',
          });
          enemy.shootCooldown = randomBetween(1.5, 2.2);
        }
      }
    });

    state.bullets = state.bullets.filter((bullet) => {
      const hitEnemy = state.enemies.some((enemy) => {
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        return Math.hypot(dx, dy) < (enemy.w + bullet.r) * 0.6;
      });
      if (hitEnemy) {
        const enemy = state.enemies.find((item) => {
          const dx = bullet.x - item.x;
          const dy = bullet.y - item.y;
          return Math.hypot(dx, dy) < (item.w + bullet.r) * 0.6;
        });
        if (enemy) {
          emitDamage(enemy, bullet.damage);
        }
        return false;
      }
      return bullet.y > -20 && bullet.y < WORLD_HEIGHT + 40 && bullet.x > -20 && bullet.x < WORLD_WIDTH + 20;
    });

    state.enemyBullets = state.enemyBullets.filter((bullet) => {
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      const hit = Math.hypot(dx, dy) < (player.w + bullet.r) * 0.6;
      if (hit && player.invulnerable <= 0) {
        if (player.shieldTimer > 0) {
          bullet.x = -999;
          player.shieldTimer = Math.max(0, player.shieldTimer - 2);
          if (!state.eventName.startsWith('laka')) state.statusMessage = 'SHIELD ABSORBED THE HIT.';
          playTone(180, 0.08, 'triangle', 0.04);
          return false;
        }
        const damage = bullet.damage;
        player.hp = Math.max(0, player.hp - damage);
        spawnParticles(player.x, player.y, '#ffb703', 14, 2.7);
        state.floatingTexts.push({ x: player.x, y: player.y - 18, text: `-${damage}`, color: '#ff9ca8', life: 0.8, maxLife: 0.8 });
        state.damageFlash = 0.14;
        state.combo = 0;
        state.shakeTimer = settingsRef.current.screenShake && !settingsRef.current.reducedMotion ? 0.18 : 0;
        playExplosion(1);
        player.invulnerable = 0.8;
        if (player.hp <= 0) {
          setGameOver();
        }
      }
      return !hit && bullet.y > -20 && bullet.y < WORLD_HEIGHT + 40 && bullet.x > -20 && bullet.x < WORLD_WIDTH + 20;
    });

    if (isGameOver()) {
      state.enemies = [];
      state.pendingSpawns = [];
      state.bullets = [];
      state.enemyBullets = [];
      state.powerUps = [];
      state.particles = [];
      state.floatingTexts = [];
      state.eventName = '';
      state.eventTimer = 0;
      state.lakaMode = false;
      state.bossActive = false;
      syncHud();
      return;
    }

    state.powerUps.forEach((power) => {
      power.y += power.vy * delta;
      const dx = power.x - player.x;
      const dy = power.y - player.y;
      if (Math.hypot(dx, dy) < 18) {
        applyPowerUp(power.type);
        power.y = -999;
      }
    });
    state.powerUps = state.powerUps.filter((power) => power.y < WORLD_HEIGHT + 50);

    state.enemies = state.enemies.filter((enemy) => {
      const hitPlayer = Math.abs(enemy.x - player.x) < (enemy.w + player.w) * 0.45 && Math.abs(enemy.y - player.y) < (enemy.h + player.h) * 0.45;
      if (hitPlayer && player.invulnerable <= 0) {
        if (player.shieldTimer > 0) {
          player.shieldTimer = 0;
          if (!state.eventName.startsWith('laka')) state.statusMessage = 'PLAYER EVADED THE SMASH';
        } else {
          const collisionDamage = enemy.type === 'boss' ? 30 : enemy.type === 'bomber' ? 24 : enemy.type === 'speedster' || enemy.type === 'runner' ? 20 : 14;
          player.hp = Math.max(0, player.hp - collisionDamage);
          state.floatingTexts.push({ x: player.x, y: player.y - 18, text: `-${collisionDamage}`, color: '#ff9ca8', life: 0.8, maxLife: 0.8 });
          spawnParticles(player.x, player.y, '#ff4d6d', 18, 2.4);
          state.damageFlash = 0.14;
          state.combo = 0;
          state.shakeTimer = settingsRef.current.screenShake && !settingsRef.current.reducedMotion ? 0.18 : 0;
          if (!state.eventName.startsWith('laka')) state.statusMessage = 'PLAYER HAS TAKEN DAMAGE';
        }
        player.invulnerable = 0.8;
        if (player.hp <= 0) {
          setGameOver();
        }
      }
      return enemy.hp > 0 && enemy.y > -200 && enemy.y < WORLD_HEIGHT + 120;
    });

    if (isGameOver()) {
      state.enemies = [];
      state.pendingSpawns = [];
      state.bullets = [];
      state.enemyBullets = [];
      state.powerUps = [];
      state.particles = [];
      state.floatingTexts = [];
      state.eventName = '';
      state.eventTimer = 0;
      state.lakaMode = false;
      state.bossActive = false;
      syncHud();
      return;
    }

    state.particles.forEach((particle) => {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.life -= delta;
    });
    state.particles = state.particles.filter((particle) => particle.life > 0);
    state.floatingTexts.forEach((item) => { item.life -= delta; item.y -= settingsRef.current.reducedMotion ? 0 : delta * 13; });
    state.floatingTexts = state.floatingTexts.filter((item) => item.life > 0);

    if (!state.bossActive && state.enemies.length === 0 && state.pendingSpawns.length === 0 && state.state === 'playing') {
      if (state.waveTransition <= 0) {
        state.waveTransition = 1.1;
        state.enemyBullets = [];
        state.statusMessage = state.wave === 40 ? 'ভাবি... আমরা পেরেছি। ❤️' : `WAVE ${String(state.wave).padStart(2, '0')} COMPLETE ✓`;
      } else {
        state.waveTransition = Math.max(0, state.waveTransition - delta);
        if (state.waveTransition === 0) {
          if (state.wave >= 40 && !state.endlessMode) {
            finishVictory();
            return;
          }
          state.wave += 1;
          state.waveAge = 0;
          state.waveGoal = 8 + Math.min(state.wave, 33) * 2;
          state.waveKills = 0;
          spawnWave(state.wave);
          if (state.wave % 5 === 0) restoreCheckpoint(state.wave);
        }
      }
    }

    if (state.score > state.highScore) {
      state.highScore = state.score;
    }

    if (state.score > 0 && state.score % 2000 === 0) {
      state.statusMessage = 'কম্বো x' + Math.min(5, Math.floor(state.combo / 5) + 1) + ', ভাবি!';
    }

    if (state.enemies.length > 0) {
      state.statusMessage = state.statusMessage || 'বি সেকশন সবার মুখে, ভাবি!';
    }

    if (state.bossLowDialogTimer > 0) {
      state.statusMessage = state.bossLowPause > 0 ? 'একটু দাঁড়াও...' : 'HP এত কম কেন?! 😭';
    }
    syncHud();
  };

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const state = gameRef.current;
    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);
    context.save();
    if (settingsRef.current.screenShake && !settingsRef.current.reducedMotion && state.shakeTimer > 0) {
      const shakeStrength = Math.min(9, state.shakeTimer * 11);
      context.translate(randomBetween(-shakeStrength, shakeStrength), randomBetween(-shakeStrength, shakeStrength));
    }

    const gradient = context.createLinearGradient(0, 0, 0, height);
    const finale = state.state === 'victory';
    const cinematic = state.finalSequence !== 'idle' && state.finalSequence !== 'active';
    gradient.addColorStop(0, finale ? '#392c20' : cinematic ? '#02040a' : '#071225');
    gradient.addColorStop(0.5, finale ? '#202a2c' : cinematic ? '#070b12' : '#111c3a');
    gradient.addColorStop(1, finale ? '#101922' : cinematic ? '#03050a' : '#050a17');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    for (let i = 0; i < 44; i += 1) {
      const x = (i * 97 + (performance.now() * 0.04)) % (width + 50);
      const y = (i * 53) % height;
      context.fillStyle = 'rgba(255,255,255,0.16)';
      context.fillRect(x, y, 2, 2);
    }

    context.strokeStyle = 'rgba(110, 231, 255, 0.12)';
    context.lineWidth = 1;
    for (let y = 0; y < height; y += 48) {
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(width, y + 0.5);
      context.stroke();
    }

    if (state.state === 'menu') {
      const time = performance.now() / 1000;
      [-1, 0, 1].forEach((lane, index) => {
        const x = width / 2 + lane * 190 + Math.sin(time * 0.7 + index) * 26;
        const y = 105 + index * 46 + Math.sin(time + index * 2) * 10;
        context.save();
        context.translate(x, y);
        context.fillStyle = '#ff9a62';
        context.shadowColor = '#ff784d';
        context.shadowBlur = 14;
        context.beginPath();
        context.moveTo(0, 17);
        context.lineTo(-18, -12);
        context.lineTo(0, -5);
        context.lineTo(18, -12);
        context.closePath();
        context.fill();
        context.shadowBlur = 0;
        context.fillStyle = '#fff2e8';
        context.font = 'bold 12px sans-serif';
        context.textAlign = 'center';
        context.fillText('B', 0, 5);
        context.restore();
      });
      context.fillStyle = 'rgba(255, 151, 91, 0.65)';
      for (let i = 0; i < 4; i += 1) {
        const x = width / 2 + Math.sin(time * 1.4 + i) * (90 + i * 38);
        const y = 260 + ((time * 92 + i * 120) % 260);
        context.fillRect(x - 2, y, 4, 12);
      }
    }

    state.enemies.forEach((enemy) => {
      const warningLead = enemy.type === 'boss' ? 0.9 : 0.34;
      if (enemy.shootCooldown > warningLead || enemy.y > WORLD_HEIGHT * 0.58 || enemy.isFakeDead) return;
      const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
      context.save();
      context.strokeStyle = enemy.type === 'boss' ? 'rgba(255, 92, 98, 0.58)' : 'rgba(255, 177, 116, 0.42)';
      context.lineWidth = enemy.type === 'boss' ? 2 : 1;
      context.setLineDash([6, 8]);
      const warningCount = enemy.type === 'boss' ? (state.bossPhase >= 3 ? 5 : 3) : 1;
      const fan = enemy.type === 'boss' ? (state.bossPhase >= 3 ? 0.82 : 0.28) : 0;
      for (let index = 0; index < warningCount; index += 1) {
        const offset = warningCount === 1 ? 0 : (index / (warningCount - 1) - 0.5) * fan;
        const warningAngle = angle + offset;
        context.beginPath();
        context.moveTo(enemy.x, enemy.y + enemy.h / 2);
        context.lineTo(enemy.x + Math.cos(warningAngle) * 145, enemy.y + Math.sin(warningAngle) * 145);
        context.stroke();
      }
      if (enemy.type === 'boss' && state.bossPhase >= 3) {
        for (const side of [-1, 1]) {
          const laneX = enemy.x + side * enemy.w * 0.24;
          context.beginPath();
          context.moveTo(laneX, enemy.y + enemy.h / 2);
          context.lineTo(laneX + side * 42, enemy.y + enemy.h / 2 + 145);
          context.stroke();
        }
      }
      context.restore();
    });

    state.bullets.forEach((bullet) => {
      context.strokeStyle = bullet.color;
      context.lineWidth = Math.max(2, bullet.r * 0.85);
      context.globalAlpha = 0.45;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.025, bullet.y - bullet.vy * 0.025);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = bullet.color;
      context.shadowColor = bullet.color;
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    });

    state.enemyBullets.forEach((bullet) => {
      context.strokeStyle = bullet.color;
      context.lineWidth = Math.max(2, bullet.r * 0.7);
      context.globalAlpha = 0.4;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.035, bullet.y - bullet.vy * 0.035);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = bullet.color;
      context.shadowColor = '#ff6b6b';
      context.shadowBlur = 14;
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
    });

    state.enemies.forEach((enemy) => {
      const isBoss = enemy.type === 'boss';
      context.save();
      context.translate(enemy.x, enemy.y);
      context.globalAlpha = enemy.isFakeDead ? 0.4 : 1;
      context.fillStyle = (enemy.hitFlash ?? 0) > 0 ? '#fff0b0' : isBoss ? '#ff4d6d' : '#ff8d61';
      context.shadowColor = isBoss ? '#ff4d6d' : '#ff8d61';
      context.shadowBlur = isBoss ? 25 : 13;
      if (isBoss) {
        context.beginPath();
        context.moveTo(-enemy.w * 0.5, -enemy.h * 0.12);
        context.lineTo(-enemy.w * 0.34, -enemy.h * 0.5);
        context.lineTo(-enemy.w * 0.14, -enemy.h * 0.36);
        context.lineTo(0, -enemy.h * 0.49);
        context.lineTo(enemy.w * 0.14, -enemy.h * 0.36);
        context.lineTo(enemy.w * 0.34, -enemy.h * 0.5);
        context.lineTo(enemy.w * 0.5, -enemy.h * 0.12);
        context.lineTo(enemy.w * 0.32, enemy.h * 0.5);
        context.lineTo(0, enemy.h * 0.34);
        context.lineTo(-enemy.w * 0.32, enemy.h * 0.5);
        context.closePath();
        context.fill();
        context.strokeStyle = '#ffd166';
        context.lineWidth = 2;
        context.stroke();
      } else {
        context.beginPath();
        context.moveTo(0, enemy.h / 2);
        context.lineTo(-enemy.w / 2, -enemy.h / 2);
        context.lineTo(0, -enemy.h / 4);
        context.lineTo(enemy.w / 2, -enemy.h / 2);
        context.closePath();
        context.fill();
      }
      context.fillStyle = '#dfe6ff';
      context.font = isBoss ? 'bold 34px sans-serif' : 'bold 16px sans-serif';
      context.textAlign = 'center';
      context.fillText('B', 0, isBoss ? 12 : 8);
      if (enemy.isFakeDead) {
        context.fillStyle = '#ffffff';
        context.font = 'bold 11px sans-serif';
        context.fillText('Zzz', 0, -enemy.h / 2 - 5);
      }
      if (isBoss) {
        context.fillStyle = '#0b1020';
        context.fillRect(-enemy.w / 2, -enemy.h / 2 - 14, enemy.w, 8);
        context.fillStyle = '#6ee7ff';
        context.fillRect(-enemy.w / 2, -enemy.h / 2 - 14, (enemy.hp / enemy.maxHp) * enemy.w, 8);
      }
      context.restore();
    });

    const player = state.player;
    const victoryTime = performance.now() / 1000;
    const playerDrawY = state.state === 'victory' ? height * 0.53 + Math.sin(victoryTime * 1.5) * 8 : player.y;
    context.save();
    context.translate(player.x, playerDrawY + player.recoil * 0.22);
    if (player.shieldTimer > 0) {
      context.strokeStyle = `rgba(125, 232, 247, ${0.48 + Math.sin(victoryTime * 5) * 0.12})`;
      context.lineWidth = 2;
      context.shadowColor = '#7de8f7';
      context.shadowBlur = 13;
      context.beginPath();
      context.ellipse(0, 0, player.w * 0.92, player.h * 1.25, 0, 0, Math.PI * 2);
      context.stroke();
      context.shadowBlur = 0;
    }
    context.rotate(player.tilt + (state.state === 'victory' ? Math.sin(victoryTime) * 0.05 : 0));
    context.globalAlpha = player.invulnerable > 0 && Math.floor(performance.now() / 65) % 2 === 0 ? 0.5 : 1;
    const flameLength = player.velocityY < -20 ? 14 : player.velocityY > 20 ? 7 : 10;
    context.fillStyle = player.velocityY > 20 ? '#ffb15e' : '#66e8ff';
    context.shadowColor = context.fillStyle;
    context.shadowBlur = player.muzzleFlash > 0 ? 18 : state.combo >= 5 ? 20 : 10;
    context.beginPath();
    context.moveTo(-6, player.h / 3);
    context.lineTo(0, player.h / 2 + flameLength + Math.random() * 4);
    context.lineTo(6, player.h / 3);
    context.closePath();
    context.fill();
    context.fillStyle = player.shieldTimer > 0 ? '#aaf4ff' : '#61d8ed';
    context.beginPath();
    context.moveTo(0, -player.h / 2 - player.muzzleFlash * 22);
    context.lineTo(player.w / 2, player.h / 2);
    context.lineTo(8, player.h / 3);
    context.lineTo(0, player.h / 2);
    context.lineTo(-8, player.h / 3);
    context.lineTo(-player.w / 2, player.h / 2);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = '#f2fbff';
    context.beginPath();
    context.ellipse(0, -2, 4, 8, 0, 0, Math.PI * 2);
    context.fill();
    if (player.muzzleFlash > 0) {
      context.fillStyle = '#fff4b0';
      context.beginPath();
      context.arc(0, -player.h / 2 - 8, 4 + player.muzzleFlash * 40, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    if (state.state === 'menu' || state.state === 'victory') {
      context.fillStyle = 'rgba(111, 226, 247, 0.8)';
      context.font = 'bold 11px sans-serif';
      context.textAlign = 'center';
      context.fillText('PLAYER 1', player.x, playerDrawY + 42);
    }

    state.powerUps.forEach((power) => {
      const colors = {
        double: '#ffd166',
        rapid: '#7ef9ff',
        shield: '#90f1ef',
        mega: '#ff8fab',
        clear: '#b9fbc0',
        boost: '#a981ff',
        repair: '#b7ffd1',
      };
      context.fillStyle = colors[power.type];
      context.shadowColor = colors[power.type];
      context.shadowBlur = 18;
      context.beginPath();
      context.arc(power.x, power.y, power.r, 0, Math.PI * 2);
      context.fill();
      context.shadowBlur = 0;
      context.fillStyle = '#0c1225';
      context.font = 'bold 10px sans-serif';
      context.textAlign = 'center';
      context.fillText(power.type.toUpperCase().slice(0, 1), power.x, power.y + 3);
    });

    state.particles.forEach((particle) => {
      const alpha = particle.life / particle.maxLife;
      context.beginPath();
      context.fillStyle = particle.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fill();
    });

    state.floatingTexts.forEach((item) => {
      const progress = 1 - item.life / item.maxLife;
      context.save();
      context.globalAlpha = Math.min(1, item.life * 1.8);
      context.textAlign = 'center';
      context.font = item.maxLife > 1.2 ? 'bold 27px sans-serif' : 'bold 20px sans-serif';
      context.fillStyle = item.color;
      context.shadowColor = item.color;
      context.shadowBlur = 10;
      context.fillText(item.text, item.x, item.y - progress * (item.maxLife > 1.2 ? 24 : 32));
      context.restore();
    });

    if (state.state === 'victory') {
      const time = performance.now() / 1000;
      const confettiColors = ['#ffd166', '#80edc5', '#f78c6b', '#e6f7ff'];
      for (let i = 0; i < (settingsRef.current.reducedMotion ? 16 : 54); i += 1) {
        const x = (i * 163 + Math.sin(time + i) * 24) % width;
        const y = (i * 79 + time * (34 + (i % 4) * 12)) % height;
        context.save();
        context.translate(x, y);
        if (!settingsRef.current.reducedMotion) context.rotate(time + i);
        context.fillStyle = confettiColors[i % confettiColors.length];
        context.globalAlpha = 0.72;
        context.fillRect(-2, -4, 4, 8);
        context.restore();
      }
    }

    if (state.state === 'countdown') {
      context.fillStyle = 'rgba(5, 12, 21, 0.6)';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.font = 'bold 72px sans-serif';
      context.fillText(String(Math.ceil(state.countdown) || 'FIRE!'), width / 2, height / 2 + 20);
      context.font = 'bold 32px sans-serif';
      context.fillText('READY?', width / 2, height / 2 - 44);
    }

    if (state.state === 'paused') {
      context.fillStyle = 'rgba(5, 12, 21, 0.6)';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#ffffff';
      context.textAlign = 'center';
      context.font = 'bold 48px sans-serif';
      context.fillText('GAME PAUSED', width / 2, height / 2);
    }

    if (state.state === 'gameover' || state.state === 'menu') {
      context.fillStyle = 'rgba(6, 12, 20, 0.28)';
      context.fillRect(0, 0, width, height);
    }

    if (state.state === 'playing' && player.hp <= 30) {
      const danger = context.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, height * 0.82);
      danger.addColorStop(0, 'rgba(255, 35, 54, 0)');
      danger.addColorStop(1, `rgba(255, 35, 54, ${0.22 + Math.sin(victoryTime * 5) * 0.06})`);
      context.fillStyle = danger;
      context.fillRect(0, 0, width, height);
    }
    if (state.damageFlash > 0) {
      context.fillStyle = `rgba(255, 52, 73, ${state.damageFlash * 0.38})`;
      context.fillRect(0, 0, width, height);
    }

    if (cinematic) {
      context.fillStyle = state.finalSequence === 'defeat' ? 'rgba(2, 4, 9, 0.32)' : 'rgba(2, 4, 9, 0.78)';
      context.fillRect(0, 0, width, height);
      if (state.statusMessage) {
        context.textAlign = 'center';
        context.fillStyle = state.finalSequence === 'boss-entry' ? '#ffd166' : '#f5f2e8';
        context.font = state.finalSequence === 'boss-entry' ? 'bold 30px sans-serif' : 'bold 36px sans-serif';
        context.shadowColor = 'rgba(255, 209, 102, 0.42)';
        context.shadowBlur = 20;
        context.fillText(state.statusMessage, width / 2, height * 0.43);
        context.shadowBlur = 0;
      }
    }

    if (state.shockwaveTimer > 0) {
      const duration = state.wave === 40 ? 1.4 : 0.7;
      const progress = 1 - state.shockwaveTimer / duration;
      context.beginPath();
      context.strokeStyle = `rgba(255, 226, 160, ${Math.max(0, 1 - progress)})`;
      context.lineWidth = 3 + (1 - progress) * 5;
      context.arc(width / 2, 142, 18 + progress * width * 0.62, 0, Math.PI * 2);
      context.stroke();
    }

    if (state.eventTimer > 0 && ['attendance', 'one-b', 'protest', 'meeting', 'traffic', 'laka-warning', 'laka-intro', 'laka', 'self-confusion', 'vip', 'celebration'].includes(state.eventName)) {
      context.fillStyle = 'rgba(5, 12, 20, 0.74)';
      context.fillRect(width * 0.18, 78, width * 0.64, 45);
      context.textAlign = 'center';
      context.fillStyle = state.eventName.startsWith('laka') ? '#ffd166' : '#eff9ff';
      context.font = 'bold 17px sans-serif';
      const eventLabel = state.eventName === 'attendance'
        ? 'B SECTION ATTENDANCE · Present: 32 · Absent: 0'
        : state.eventName === 'laka-warning' ? '⚠️ জরুরি অবস্থা'
          : state.eventName === 'laka-intro' ? 'ভাবি...'
            : state.eventName === 'laka' ? 'ভাবি, লাকা উঠাও!!! 😭🔥'
              : state.eventName === 'one-b' ? 'আমি একাই যথেষ্ট।'
                : state.eventName === 'self-confusion' ? 'B SECTION: ????? ??????... ?????????'
                  : state.statusMessage;
      context.fillText(eventLabel, width / 2, 107);
    }

    if (state.bossActive && state.bossHp > 0) {
      const barWidth = width * 0.7;
      const barX = (width - barWidth) / 2;
      const barY = 20;
      context.fillStyle = 'rgba(10, 15, 22, 0.9)';
      context.fillRect(barX, barY, barWidth, 18);
      context.fillStyle = '#ff5d8f';
      context.fillRect(barX, barY, (state.bossHp / state.bossMaxHp) * barWidth, 18);
      context.font = 'bold 14px sans-serif';
      context.textAlign = 'center';
      context.fillStyle = '#fff';
      const bossTitle = state.wave === 40 ? 'বি সেকশনের বড় ভাই' : state.wave === 10 ? 'বি সেকশনের ডেপুটি' : 'B SECTION MINI-BOSS';
      context.fillText(bossTitle, width / 2, 14);
    }
    context.restore();
  };

  useEffect(() => {
    const storage = readStorage();
    setSoundOn(storage.settings.soundOn);
    setMusicOn(storage.settings.musicOn);
    setScreenShake(storage.settings.screenShake);
    setReducedMotion(storage.settings.reducedMotion);
    setBanglaComedy(storage.settings.banglaComedy);
    setBestEndlessWave(storage.bestEndlessWave);
    setBestEndlessScore(storage.bestEndlessScore);
    setLeaderboard(storage.leaderboard);
    gameRef.current.highScore = storage.highScore;
    setStorageReady(true);
    syncHud();
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const saved = readStorage();
    writeStorage({
      highScore: saved.highScore,
      bestCampaignCombo: saved.bestCampaignCombo,
      bestEndlessWave: Math.max(bestEndlessWave, saved.bestEndlessWave),
      bestEndlessScore: Math.max(bestEndlessScore, saved.bestEndlessScore),
      leaderboard,
      settings: { soundOn, musicOn, screenShake, reducedMotion, banglaComedy },
    });
  }, [leaderboard, soundOn, musicOn, screenShake, reducedMotion, banglaComedy, storageReady]);

  useEffect(() => () => {
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'f9' && import.meta.env.DEV) {
        event.preventDefault();
        skipCurrentWaveForDev();
        return;
      }
      if (key === 'f10' && import.meta.env.DEV) {
        event.preventDefault();
        jumpToNextMilestoneForDev();
        return;
      }
      if (key === 'f11' && import.meta.env.DEV) {
        event.preventDefault();
        jumpToWaveForDev(40);
        return;
      }
      if (['a', 'd', 'w', 's', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        inputRef.current.pointerActive = false;
        if (key.startsWith('arrow') && gameRef.current.state === 'playing') event.preventDefault();
      }
      if (key === 'a' || key === 'arrowleft') inputRef.current.left = true;
      if (key === 'd' || key === 'arrowright') inputRef.current.right = true;
      if (key === 'w' || key === 'arrowup') inputRef.current.up = true;
      if (key === 's' || key === 'arrowdown') inputRef.current.down = true;
      if (key === ' ') {
        if (gameRef.current.state === 'playing') event.preventDefault();
        inputRef.current.firing = true;
      }
      if (key === 'p' || key === 'escape') {
        const state = gameRef.current;
        if (state.state === 'playing') {
          state.state = 'paused';
          setHud((prev) => ({ ...prev, screen: 'paused' }));
        } else if (state.state === 'paused') {
          state.state = 'playing';
          setHud((prev) => ({ ...prev, screen: 'playing' }));
        }
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'a' || key === 'arrowleft') inputRef.current.left = false;
      if (key === 'd' || key === 'arrowright') inputRef.current.right = false;
      if (key === 'w' || key === 'arrowup') inputRef.current.up = false;
      if (key === 's' || key === 'arrowdown') inputRef.current.down = false;
      if (key === ' ') inputRef.current.firing = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * WORLD_WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * WORLD_HEIGHT;
      inputRef.current.pointerX = x;
      inputRef.current.pointerY = y;
      inputRef.current.pointerActive = true;
    };

    const handlePointerDown = () => {
      inputRef.current.firing = true;
      inputRef.current.pointerActive = true;
    };

    const handlePointerUp = () => {
      inputRef.current.firing = false;
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const loop = (timestamp: number) => {
      const state = gameRef.current;
      const previous = (loop as typeof loop & { last?: number }).last ?? timestamp;
      const delta = Math.min(0.033, (timestamp - previous) / 1000);
      (loop as typeof loop & { last?: number }).last = timestamp;

      if (state.state === 'playing' || state.state === 'countdown') {
        updateGame(delta);
      }
      render();
      frameIdRef.current = window.requestAnimationFrame(loop);
    };

    frameIdRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (frameIdRef.current) {
        window.cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (musicOn && hud.screen === 'playing') {
      if (musicTimerRef.current) {
        window.clearInterval(musicTimerRef.current);
      }
      musicTimerRef.current = window.setInterval(() => {
        if (soundOn && gameRef.current.state === 'playing') {
          playTone(180, 0.08, 'triangle', 0.012);
          setTimeout(() => playTone(240, 0.075, 'sine', 0.012), 100);
        }
      }, 5000);
    } else if (musicTimerRef.current) {
      window.clearInterval(musicTimerRef.current);
    }

    return () => {
      if (musicTimerRef.current) {
        window.clearInterval(musicTimerRef.current);
      }
    };
  }, [musicOn, soundOn, hud.screen]);

  const screenTitle = useMemo(() => {
    const state = gameRef.current.state;
    if (state === 'menu') return 'বি সেকশন ইনভেশন';
    if (state === 'gameover') return 'আজকে আর পারলাম না 😭';
    if (state === 'victory') return 'B Section Roasted, Bhabi Caught';
    return 'B Section Roasted, Bhabi Caught';
  }, [hud.screen]);

  const startGame = () => {
    if (playerName.trim().length < 2) {
      setNameDraft(playerName);
      setNameRequired(true);
      setNameError('খেলা শুরু করতে ২–২০ অক্ষরের নাম দিন।');
      setShowNameModal(true);
      return;
    }
    audioUnlockedRef.current = true;
    const audio = ensureAudio();
    if (audio?.state === 'suspended') void audio.resume().catch(() => undefined);
    resetGame();
    setShowHowTo(false);
    setShowLeaderboard(false);
    setShowSettings(false);
    setHud((prev) => ({ ...prev, screen: 'countdown', countdown: 3, statusMessage: 'READY?' }));
    if (soundOn) {
      setTimeout(() => playTone(520, 0.1, 'triangle', 0.08), 100);
    }
    setShowControlsHint(true);
    window.setTimeout(() => setShowControlsHint(false), 6500);
  };

  const openNameEditor = () => {
    setNameDraft(playerName);
    setNameError('');
    setNameRequired(false);
    setShowNameModal(true);
  };

  const savePlayerName = () => {
    const cleanName = nameDraft.trim();
    if (cleanName.length < 2 || cleanName.length > 20) {
      setNameError('নাম ২–২০ অক্ষরের মধ্যে হতে হবে।');
      return;
    }
    setPlayerName(cleanName);
    try { window.localStorage.setItem(NAME_KEY, cleanName); } catch { /* Current session still keeps the name. */ }
    setShowNameModal(false);
    const updatedScores = leaderboardRef.current.map((entry) => entry.id && entry.id === lastRecordId ? { ...entry, name: cleanName } : entry);
    if (updatedScores !== leaderboardRef.current) {
      setLeaderboard(updatedScores);
      const saved = readStorage();
      writeStorage({ ...saved, leaderboard: updatedScores });
    }
    setNameError('');
    if (nameRequired) {
      setNameRequired(false);
      window.setTimeout(() => startGame(), 0);
    }
  };

  const clearLocalRecords = () => {
    const confirmed = window.confirm('এই ডিভাইসের নাম, রেকর্ড ও সেটিংস মুছে ফেলবেন?');
    if (!confirmed) return;
    [STORAGE_KEY, NAME_KEY, CAMPAIGN_SCORES_KEY, ENDLESS_SCORES_KEY, SETTINGS_KEY, 'b-section-player-name', 'b-section-campaign-scores', 'b-section-endless-scores'].forEach((key) => window.localStorage.removeItem(key));
    setLeaderboard([]);
    setPlayerName('');
    setBestEndlessScore(0);
    setBestEndlessWave(0);
    setHud((prev) => ({ ...prev, highScore: 0 }));
    setShowSettings(false);
  };

  const returnToMenu = () => {
    const state = gameRef.current;
    state.state = 'menu';
    state.enemies = [];
    state.pendingSpawns = [];
    state.bullets = [];
    state.enemyBullets = [];
    state.particles = [];
    state.powerUps = [];
    state.floatingTexts = [];
    state.eventName = '';
    state.eventTimer = 0;
    state.lakaMode = false;
    state.bossActive = false;
    state.bossHp = 0;
    state.bossMaxHp = 0;
    state.finalSequence = 'idle';
    state.finalSequenceTimer = 0;
    state.bossLowPause = 0;
    state.bossLowDialogTimer = 0;
    Object.assign(inputRef.current, { left: false, right: false, up: false, down: false, firing: false, pointerActive: false });
    setCheckpointNotice(false);
    setHud((previous) => ({ ...previous, screen: 'menu', bossHp: 0, bossMaxHp: 0, enemyCount: 0 }));
  };

  const handlePauseToggle = () => {
    const state = gameRef.current;
    if (state.state === 'playing') {
      Object.assign(inputRef.current, { left: false, right: false, up: false, down: false, firing: false, pointerActive: false });
      state.state = 'paused';
      setHud((prev) => ({ ...prev, screen: 'paused' }));
    } else if (state.state === 'paused') {
      state.state = 'playing';
      setHud((prev) => ({ ...prev, screen: 'playing' }));
    }
  };

  const handleTouchMove = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (direction === 'up') inputRef.current.up = true;
    if (direction === 'down') inputRef.current.down = true;
    if (direction === 'left') inputRef.current.left = true;
    if (direction === 'right') inputRef.current.right = true;
  };

  const handleTouchStop = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (direction === 'up') inputRef.current.up = false;
    if (direction === 'down') inputRef.current.down = false;
    if (direction === 'left') inputRef.current.left = false;
    if (direction === 'right') inputRef.current.right = false;
  };

  const startEndless = () => {
    if (gameRef.current.state !== 'victory' || gameRef.current.wave < 40) return;
    startGame();
    gameRef.current.endlessMode = true;
    gameRef.current.wave = 1;
    gameRef.current.waveGoal = 10;
    gameRef.current.pendingSpawns = [];
    spawnWave(1);
    syncHud();
  };

  const shareResults = async () => {
    const text = `B Section Roasted, Bhabi Caught · ${playerName} · ${hud.score} points · Wave ${hud.wave}${gameRef.current.endlessMode ? '' : '/40'}`;
    try {
      if (navigator.share) await navigator.share({ title: 'B Section Roasted, Bhabi Caught', text });
      else await navigator.clipboard.writeText(text);
    } catch {
      gameRef.current.statusMessage = 'রেজাল্ট শেয়ার করা যায়নি, ভাবি!';
      syncHud();
    }
  };

  const skipCurrentWaveForDev = () => {
    if (!import.meta.env.DEV) return;
    const state = gameRef.current;
    if (state.state === 'playing' && state.wave < 40) {
      state.enemies = [];
      state.pendingSpawns = [];
      state.enemyBullets = [];
      state.bossActive = false;
      state.bossHp = 0;
      state.bossMaxHp = 0;
      state.waveTransition = 0.5;
      state.statusMessage = 'DEV TEST · Wave clear';
      syncHud();
    } else if (state.state === 'playing' && state.wave === 40 && state.finalSequence === 'active' && state.bossActive) {
      const finalBoss = state.enemies.find((enemy) => enemy.type === 'boss');
      if (finalBoss) emitDamage(finalBoss, finalBoss.hp + 1);
    }
  };

  const jumpToWaveForDev = (wave: number) => {
    if (!import.meta.env.DEV || gameRef.current.state !== 'playing') return;
    const state = gameRef.current;
    state.wave = wave;
    state.waveAge = 0;
    state.waveKills = 0;
    state.waveTransition = 0;
    state.enemies = [];
    state.pendingSpawns = [];
    state.enemyBullets = [];
    state.bullets = [];
    state.bossActive = false;
    state.bossHp = 0;
    state.bossMaxHp = 0;
    state.finalSequence = 'idle';
    state.finalSequenceTimer = 0;
    state.finalDefeatHandled = false;
    state.bossLowPause = 0;
    state.bossLowDialogShown = false;
    state.eventName = '';
    state.eventTimer = 0;
    state.lakaMode = false;
    state.player.rapidTimer = 0;
    state.player.shieldTimer = 0;
    state.player.boostTimer = 0;
    state.player.doubleTimer = 0;
    state.player.megaTimer = 0;
    state.player.speed = 280;
    state.statusMessage = `DEV TEST · Wave ${wave}`;
    spawnWave(wave);
    if (wave > 1 && wave % 5 === 0 && wave < 40) restoreCheckpoint(wave);
    syncHud();
  };

  const jumpToNextMilestoneForDev = () => {
    const milestones = [5, 10, 20, 30, 35, 39, 40];
    const nextWave = milestones.find((wave) => wave > gameRef.current.wave) ?? 40;
    jumpToWaveForDev(nextWave);
  };

  const triggerLakaForDev = () => {
    if (!import.meta.env.DEV || gameRef.current.state !== 'playing') return;
    const state = gameRef.current;
    state.eventName = 'laka-warning';
    state.eventTimer = 0.8;
    state.lakaMode = false;
    state.specialEvents += 1;
    state.statusMessage = '⚠️ জরুরি অবস্থা';
    syncHud();
  };

  const damageFinalBossForDev = () => {
    if (!import.meta.env.DEV) return;
    const state = gameRef.current;
    if (state.state !== 'playing' || state.wave !== 40 || state.finalSequence !== 'active') return;
    const boss = state.enemies.find((enemy) => enemy.type === 'boss');
    if (boss) emitDamage(boss, Math.ceil(boss.maxHp * 0.22));
  };

  return (
    <div className={`game-shell ${hud.screen === 'menu' ? 'menu-screen' : 'play-screen'} ${reducedMotion ? 'reduced-motion' : ''}`}>
      {hud.screen === 'menu' && (
        <nav className="top-nav" aria-label="প্রধান নেভিগেশন">
          <a className="brand-mark" href="#top" aria-label="B Section Roasted, Bhabi Caught home">B<span>·</span>ROASTED</a>
          <div className="nav-actions">
            <button className="nav-link" onClick={() => setShowHowTo(true)}>কীভাবে খেলি</button>
            <button className="nav-link" onClick={() => setShowLeaderboard(true)}>লিডারবোর্ড</button>
            <button className="nav-link" onClick={() => setShowSettings(true)}>সেটিংস</button>
          </div>
          <button className="mobile-menu-button" aria-label="মেনু" aria-expanded={showMobileMenu} onClick={() => setShowMobileMenu((open) => !open)}>☰</button>
          {showMobileMenu && <div className="mobile-nav-menu"><button onClick={() => { setShowHowTo(true); setShowMobileMenu(false); }}>কীভাবে খেলি</button><button onClick={() => { setShowLeaderboard(true); setShowMobileMenu(false); }}>লিডারবোর্ড</button><button onClick={() => { setShowSettings(true); setShowMobileMenu(false); }}>সেটিংস</button></div>}
        </nav>
      )}
      <div className="hud-header">
        <div className="stat-block">
          <span className="label">PLAYER · HP</span>
          <div className="hp-stat"><strong><span className="hp-heart">♥</span> {hud.playerHp}<small> / {hud.playerMaxHp}</small></strong><div className="hp-rail"><i style={{ width: `${clamp((hud.playerHp / hud.playerMaxHp) * 100, 0, 100)}%`, background: hud.playerHp / hud.playerMaxHp < 0.3 ? '#ff647c' : hud.playerHp / hud.playerMaxHp < 0.6 ? '#ffd166' : '#79dfba' }} /></div></div>
        </div>
        <div className="stat-block center">
          <span className="label">{gameRef.current.endlessMode ? 'B SECTION NEVER ENDS 😭' : 'CAMPAIGN'}</span>
          <strong>{gameRef.current.endlessMode && hud.wave > 40 ? `ENDLESS · ${hud.wave}` : <>WAVE {String(hud.wave).padStart(2, '0')} <small>/ 40</small></>}</strong>
          <small className="combo-readout">COMBO ×{hud.combo}</small>
        </div>
        <div className="stat-block right">
          <span className="label">স্কোর</span>
          <strong>{hud.score.toLocaleString()}</strong>
          <small className="best-score">BEST {(gameRef.current.endlessMode ? Math.max(bestEndlessScore, hud.score) : Math.max(hud.highScore, hud.score)).toLocaleString()}</small>
        </div>
      </div>
      {hud.screen === 'playing' && <button className="pause-button" onClick={handlePauseToggle} aria-label="Pause game">Ⅱ <span>PAUSE</span></button>}
      {hud.screen !== 'menu' && hud.powerUps.length > 0 && <div className="active-powerups" aria-label="Active power-ups">
        {hud.powerUps.map((power) => <div className="active-powerup" key={power.key} style={{ '--power-color': power.color } as React.CSSProperties}>
          <span className="power-icon">{power.icon}</span><span className="power-label">{power.label}</span><strong>{power.time}s</strong><i><b style={{ width: `${Math.min(100, (power.time / 10) * 100)}%` }} /></i>
        </div>)}
      </div>}

      <main className={`homepage-layout ${hud.screen === 'menu' ? 'homepage-active' : 'homepage-inactive'}`}>
      {hud.screen === 'menu' && <>
        <section className="homepage-copy">
          <p className="eyebrow">ARCADE SHOOTER</p>
          <h1>B Section<br />Roasted,<br />Bhabi Caught</h1>
          <p className="homepage-subtitle">বি সেকশন রোস্টেড, ভাবি ধরা!</p>
          <p className="homepage-description"><span>ওরা উপর থেকে আসবে।</span><span>তুমি নিচ থেকে সামলাবে।</span><small>আর হ্যাঁ... ওরা বারবার আসবে। 😭</small></p>
          <div className="homepage-actions"><button onClick={startGame}>শুরু করি 🔥</button><button className="ghost" onClick={() => setShowHowTo(true)}>কীভাবে খেলবো</button></div>
          <p className="player-name-label">খেলোয়াড়: <strong>{playerName || 'নাম যোগ করুন'}</strong> <button onClick={openNameEditor}>নাম</button></p>
          <div className="homepage-hints"><span><b>MOVE</b> WASD / Arrows</span><span><b>FIRE</b> Space / Click</span><span><b>SURVIVE</b> 40 Waves</span></div>
        </section>
        </>}
        <div className={`battlefield-frame ${hud.screen === 'menu' ? 'preview-frame' : 'game-frame'}`}>{hud.screen === 'menu' && <div className="battlefield-tag">LIVE BATTLE PREVIEW <i /></div>}
      <div className={`game-stage ${hud.screen === 'menu' ? 'homepage-battlefield' : ''}`}>
        <canvas ref={canvasRef} width={WORLD_WIDTH} height={WORLD_HEIGHT} className="game-canvas" />
        {checkpointNotice && <div className="checkpoint-banner">CHECKPOINT ✓ · ভাবি, একটু শ্বাস নাও। 😭</div>}
        {import.meta.env.DEV && hud.screen === 'playing' && (
          <div className="dev-controls">
            <button className="dev-milestone" onClick={jumpToNextMilestoneForDev}>NEXT MILESTONE</button>
            <button className="dev-laka" onClick={triggerLakaForDev}>TEST LAKA</button>
            {hud.wave === 40 && gameRef.current.finalSequence === 'active' && (
              <button className="dev-boss-hit" onClick={damageFinalBossForDev}>BOSS HIT</button>
            )}
            <button className="dev-wave-skip" onClick={skipCurrentWaveForDev}>
              {hud.wave === 40 ? 'FINAL HIT' : 'SKIP WAVE'}
            </button>
          </div>
        )}

        {hud.screen === 'menu' && (
          <div className="game-overlay visible">
            <div className="panel intro-panel">
              <div className="hero-copy">
                <p className="eyebrow">ARCADE SHOOTER</p>
                <h1>{screenTitle}</h1>
                <p className="subtitle">B Section Roasted, Bhabi Caught</p>
                <p className="hero-blurb">ওরা উপর থেকে আসবে।<br />তুমি নিচ থেকে সামলাবে।<br />আর হ্যাঁ... ওরা বারবার আসবে। 😭</p>
                <span className="hero-controls">WASD / ARROWS <b>MOVE</b><i /> SPACE <b>FIRE</b></span>
              </div>
              <div className="menu-actions">
                <button onClick={startGame}>শুরু করি 🔥</button>
                <button className="ghost" onClick={() => setShowHowTo(true)}>কীভাবে খেলবো</button>
              </div>
            </div>
          </div>
        )}

        {hud.screen === 'countdown' && (
          <div className="game-overlay visible small">
            <div className="panel countdown-panel">
              <div className="countdown-label">রেডি, ভাবি?</div>
              <div className="countdown-number">{hud.countdown > 0 ? Math.ceil(hud.countdown) : 'চালাও!!!'}</div>
            </div>
          </div>
        )}

        {hud.screen === 'paused' && (
          <div className="game-overlay visible">
            <div className="panel pause-panel">
              <h2># সময় থেমে গেছে</h2>
              <div className="menu-actions compact">
                <button onClick={handlePauseToggle}>আবার খেলি</button>
                <button className="ghost" onClick={startGame}>রিস্টার্ট</button>
                <button className="ghost" onClick={returnToMenu}>হোম</button>
              </div>
            </div>
          </div>
        )}

        {hud.screen === 'gameover' && (
          <div className="game-overlay visible">
            <div className="panel gameover-panel">
              <div className="result-player-name">{playerName} · তোমার ফলাফল</div>
              <h2>আজকে B Section জিতে গেল 😭</h2>
              <p className="result-subtitle">আবার চেষ্টা করি? এবার aircraft একটু জোরে চালিও।</p>
              <p className="result-saved">লিডারবোর্ডে তোমার ফলাফল যোগ হয়েছে</p>
              <div className="summary-grid">
                <div><span>স্কোর</span><strong>{hud.score}</strong></div>
                <div><span>ওয়েভ</span><strong>{hud.wave}</strong></div>
                <div><span>মারাট</span><strong>{gameRef.current.totalKills}</strong></div>
                <div><span>সেরা কম্বো</span><strong>{gameRef.current.bestCombo}</strong></div>
                <div><span>সময়</span><strong>{formatDuration(gameRef.current.totalPlayTime)}</strong></div>
              </div>
              <div className="menu-actions compact">
                <button onClick={startGame}>আবার চেষ্টা করি</button>
                <button className="ghost" onClick={returnToMenu}>হোম</button>
              </div>
            </div>
          </div>
        )}

        {hud.screen === 'victory' && (
          <div className="game-overlay visible victory-scene">
            <div className="panel victory-panel">
              <div className="victory-badge">🏆 CAMPAIGN COMPLETE</div>
              <div className="result-player-name">{playerName}</div>
              <h2>B Section Roasted, Bhabi Caught 🏆</h2>
              <p className="victory-subtitle">ভাবি... আজকে আমরা সত্যিই পেরেছি। ❤️</p>
              <div className="summary-grid victory-stats">
                <div><span>Score</span><strong>{hud.score.toLocaleString()}</strong></div>
                <div><span>Waves</span><strong>40 / 40</strong></div>
                <div><span>B Sections defeated</span><strong>{gameRef.current.totalKills}</strong></div>
                <div><span>Best combo</span><strong>{gameRef.current.bestCombo}</strong></div>
                <div><span>Time survived</span><strong>{formatDuration(gameRef.current.totalPlayTime)}</strong></div>
              </div>
              <p className="victory-message">আজকে B Section-এর পালা শেষ। 😌</p>
              <p className="victory-tomorrow">আগামীকাল আবার দেখা হবে...</p>
              <div className="menu-actions compact">
                <button onClick={startGame}>আবার খেলি</button>
                <button className="ghost" onClick={startEndless}>Endless Mode</button>
                <button className="ghost" onClick={() => { void shareResults(); }}>ফলাফল শেয়ার করি</button>
                <button className="ghost" onClick={returnToMenu}>মেইন মেনু</button>
              </div>
            </div>
          </div>
        )}

        {showHowTo && (
          <div className="modal-overlay" onClick={() => setShowHowTo(false)}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
              <h3>কীভাবে খেলবো</h3>
              <ul>
                <li>চালাও: WASD / arrow · পুরো নিচের battlefield</li>
                <li>গুলি: space / click / tap</li>
                <li>মারো: B Sectionকে, ভাবি!</li>
                <li>লক্ষ্য: প্রতিটি wave পরিষ্কার করো, wave 40-এর boss-কে হারাও।</li>
              </ul>
              <button onClick={() => setShowHowTo(false)}>বন্ধ করো</button>
            </div>
          </div>
        )}

        {showLeaderboard && (
          <div className="modal-overlay" onClick={() => setShowLeaderboard(false)}>
            <div className="modal leaderboard-modal" onClick={(event) => event.stopPropagation()}>
              <h3>LOCAL LEADERBOARD</h3>
              <p className="local-records">Stored on this device | Campaign best {readStorage().highScore.toLocaleString()} | Endless best Wave {bestEndlessWave} / {bestEndlessScore.toLocaleString()}</p>
              <div className="leaderboard-tabs"><button className={leaderboardTab === 'campaign' ? 'selected' : ''} onClick={() => setLeaderboardTab('campaign')}>Campaign</button><button className={leaderboardTab === 'endless' ? 'selected' : ''} onClick={() => setLeaderboardTab('endless')}>Endless</button></div>
              <div className="leaderboard-head"><span>RANK / PLAYER</span><span>SCORE · WAVE · COMBO · TIME · DATE</span></div>
              <ol>
                {leaderboard.filter((entry) => (entry.mode ?? 'campaign') === leaderboardTab).sort((a, b) => b.score - a.score).slice(0, 10).map((entry, index) => (
                  <li className={entry.id && entry.id === lastRecordId ? 'own-record' : ''} key={entry.id ?? `${entry.name}-${entry.score}-${index}`}>
                    <span>{index + 1}. {entry.name}{entry.id && entry.id === lastRecordId ? ' · YOU' : ''}</span>
                    <strong>{entry.score.toLocaleString()} · W{entry.wave} · x{entry.bestCombo ?? 0} · {formatDuration(entry.duration ?? 0)} · {entry.date}</strong>
                  </li>
                ))}
              </ol>
              {leaderboard.filter((entry) => (entry.mode ?? 'campaign') === leaderboardTab).length === 0 && <p className="empty-records">এখানে এখনো কোনো রেকর্ড নেই। একটি রান শেষ করলে যোগ হবে।</p>}
              <button onClick={() => setShowLeaderboard(false)}>Close</button>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
              <h3>Settings</h3>
              <div className="settings-name-row"><span>Player name</span><strong>{playerName || 'Not set'}</strong><button onClick={openNameEditor}>Change name</button></div>
              {([["Sound", soundOn, setSoundOn], ["Music", musicOn, setMusicOn], ["Screen Shake", screenShake, setScreenShake], ["Reduced Motion", reducedMotion, setReducedMotion], ["Bangla Comedy", banglaComedy, setBanglaComedy]] as const).map(([label, value, setter]) => <div className="settings-row" key={label}>
                <label htmlFor={`setting-${label}`}>{label}</label>
                <input id={`setting-${label}`} type="checkbox" checked={value} onChange={() => setter((previous) => !previous)} />
              </div>)}
              <div className="settings-actions"><button className="danger-action" onClick={clearLocalRecords}>Reset local data</button><button onClick={() => setShowSettings(false)}>Close</button></div>
            </div>
          </div>
        )}
      </div></div></main>

      <div className="bottom-bar">
        <div className="status-box">
          <span>{hud.statusMessage}</span>
          <small>পাওয়ার: {hud.powerMode}</small>
        </div>
        <div className="boss-box">
          {hud.bossHp > 0 && (
            <>
              <span>বস হেলথ</span>
              <div className="mini-bar">
                <i style={{ width: `${(hud.bossHp / Math.max(hud.bossMaxHp, 1)) * 100}%` }} />
              </div>
            </>
          )}
        </div>
      </div>

      {hud.screen === 'playing' && <div className="mobile-controls">
        <div className="virtual-joystick" aria-label="Movement joystick" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); const dx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2); const dy = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2); inputRef.current.left = dx < -0.25; inputRef.current.right = dx > 0.25; inputRef.current.up = dy < -0.25; inputRef.current.down = dy > 0.25; }} onPointerMove={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); const dx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2); const dy = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2); inputRef.current.left = dx < -0.25; inputRef.current.right = dx > 0.25; inputRef.current.up = dy < -0.25; inputRef.current.down = dy > 0.25; }} onPointerUp={(event) => { event.currentTarget.releasePointerCapture(event.pointerId); Object.assign(inputRef.current, { left: false, right: false, up: false, down: false }); }} onPointerCancel={() => Object.assign(inputRef.current, { left: false, right: false, up: false, down: false })}><span>MOVE</span><i /><small>DRAG TO MOVE</small></div>
        <button className="fire-button" aria-label="Fire continuously" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); inputRef.current.firing = true; }} onPointerUp={() => { inputRef.current.firing = false; }} onPointerCancel={() => { inputRef.current.firing = false; }} onContextMenu={(event) => event.preventDefault()}>FIRE</button>
      </div>}
      {showControlsHint && hud.screen === 'playing' && <div className="controls-hint">WASD / ARROWS MOVE · SPACE FIRE <button onClick={() => setShowControlsHint(false)} aria-label="Dismiss controls hint">×</button></div>}
      {showNameModal && <div className="modal-overlay name-modal-overlay"><form className="modal name-modal" onSubmit={(event) => { event.preventDefault(); savePlayerName(); }}><h3>{nameRequired ? 'ভাবি, তোমার নাম কী? 😄' : 'নাম পরিবর্তন'}</h3><p>লিডারবোর্ডে দেখানোর জন্য ২–২০ অক্ষরের নাম দিন।</p><input autoFocus maxLength={20} value={nameDraft} onChange={(event) => { setNameDraft(event.target.value); setNameError(''); }} placeholder="তোমার নাম লিখো" aria-label="Player name" /><small className="name-validation">{nameError || `${nameDraft.trim().length}/20`}</small><div className="name-actions"><button type="submit">{nameRequired ? 'চলো খেলি 🔥' : 'সংরক্ষণ'}</button>{!nameRequired && <button type="button" className="ghost" onClick={() => setShowNameModal(false)}>বাতিল</button>}</div></form></div>}
    </div>
  );
}

export default App;
