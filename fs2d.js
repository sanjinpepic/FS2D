// src/App.js - Single file version

import React, { createContext, useState, useEffect, useRef, useCallback, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// --- Constants (previously in gameConstants.js) ---
export const TILE_SIZE = 20;
export const GRAVITY = 0.5;

export const WORLD_WIDTH_TILES = 150;
export const WORLD_HEIGHT_TILES = 30;

export const WORLD_WIDTH_PIXELS = WORLD_WIDTH_TILES * TILE_SIZE;
export const WORLD_HEIGHT_PIXELS = WORLD_HEIGHT_TILES * TILE_SIZE;

export const GROWTH_TIME_PER_STAGE = 5000; // 5 seconds per stage

// Tile types
export const TILE_TYPE = {
    SKY: 0,
    GRASS: 1,
    DIRT: 2,
    TILLED: 3,
    CROP_PLANTED: 4,
    CROP_GROWN: 5,
};

// Crop types
export const CROP_TYPE = {
    WHEAT: 'wheat',
    CORN: 'corn',
    POTATO: 'potato',
};

// Crop growth stages
export const CROP_STAGE = {
    SEED: 0,
    YOUNG: 1,
    MATURE: 2,
};

// Base colors for tiles - Adjusted for more pixelated look
export const TILE_COLORS = {
    [TILE_TYPE.SKY]: '#87CEEB',
    [TILE_TYPE.GRASS]: '#4CAF50', // More vibrant green, like the image
    [TILE_TYPE.DIRT]: '#6F4E37', // Darker, reddish-brown, like the image
    [TILE_TYPE.TILLED]: '#593d2b', // Slightly darker tilled earth
    [CROP_TYPE.WHEAT]: {
        [CROP_STAGE.SEED]: '#A0522D',
        [CROP_STAGE.YOUNG]: '#8BC34A',
        [CROP_STAGE.MATURE]: '#FFD700',
    },
    [CROP_TYPE.CORN]: {
        [CROP_STAGE.SEED]: '#8B4513',
        [CROP_STAGE.YOUNG]: '#32CD32',
        [CROP_STAGE.MATURE]: '#FFD700',
    },
    [CROP_TYPE.POTATO]: {
        [CROP_STAGE.SEED]: '#6F4E37',
        [CROP_STAGE.YOUNG]: '#7CFC00',
        [CROP_STAGE.MATURE]: '#A0522D',
    }
};

// Crop prices (per unit)
export const CROP_PRICES = {
    [CROP_TYPE.WHEAT]: 10,
    [CROP_TYPE.CORN]: 15,
    [CROP_TYPE.POTATO]: 12,
};

// Seed prices (per unit)
export const SEED_PRICES = {
    wheatSeeds: 2,
    cornSeeds: 3,
    potatoSeeds: 2.5,
};

// Structure prices
export const STRUCTURE_PRICES = {
    silo: 500,
};

// Vehicle Upgrade Tiers
export const VEHICLE_UPGRADE_TIERS = {
    tractor: [
        { level: 0, speed: 2.5, maxFuel: 100, cost: 0 },
        { level: 1, speed: 3.5, maxFuel: 150, cost: 200 },
        { level: 2, speed: 4.5, maxFuel: 200, cost: 500 },
    ],
    combineHarvester: [
        { level: 0, speed: 2.0, maxFuel: 100, cost: 0 },
        { level: 1, speed: 3.0, maxFuel: 150, cost: 300 },
        { level: 2, speed: 4.0, maxFuel: 200, cost: 700 },
    ],
};

// Day-Night Cycle Colors
export const DEEP_NIGHT_SKY_COLOR = '#1A1A2E';
export const DAWN_SKY_COLOR = '#4682B4';
export const SUNRISE_TINT_COLOR = '#FFC0CB';
export const MORNING_SKY_COLOR = '#87CEEB';
export const AFTERNOON_SKY_COLOR = '#6A5ACD';
export const SUNSET_TINT_COLOR = '#FF7F50';
export const DUSK_SKY_COLOR = '#483D8B';

// Day speed (1 real minute = 1 in-game day)
export const DAY_SPEED = 1 / 1800; // 1 in-game hour per 1/150th of a second, adjusted for 60 FPS

export const SAVE_GAME_DOC_ID = 'myFarmSave';

// --- Utility Functions (previously in gameUtils.js) ---
// Utility function to linearly interpolate between two colors (hex strings)
export const lerpColor = (color1, color2, factor) => {
    const hexToRgb = hex => [parseInt(hex.substring(1, 3), 16), parseInt(hex.substring(3, 5), 16), parseInt(hex.substring(5, 7), 16)];
    const rgbToHex = (r, g, b) => `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase()}`;

    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    const r = Math.round(rgb1[0] + factor * (rgb2[0] - rgb1[0]));
    const g = Math.round(rgb1[1] + factor * (rgb2[1] - rgb1[1]));
    const b = Math.round(rgb1[2] + factor * (rgb2[2] - rgb1[2]));

    return rgbToHex(r, g, b);
};

// Utility function to apply light factor to a color (hex string)
export const applyLightFactorToColor = (hexColor, factor) => {
    const r = parseInt(hexColor.substring(1, 3), 16);
    const g = parseInt(hexColor.substring(3, 5), 16);
    const b = parseInt(hexColor.substring(5, 7), 16);

    const newR = Math.round(r * factor);
    const newG = Math.round(g * factor);
    const newB = Math.round(b * factor);

    return `#${(1 << 24 | newR << 16 | newG << 8 | newB).toString(16).slice(1).toUpperCase()}`;
};

// Function to get current sky color based on gameTime
export const getSkyColor = (time, colors) => {
    let currentSkyColor;
    let transitionFactor;

    if (time >= 0 && time < 5) { // Deep Night (00:00 - 05:00)
        currentSkyColor = colors.DEEP_NIGHT_SKY_COLOR;
    } else if (time >= 5 && time < 6) { // Late Night/Early Dawn (05:00 - 06:00)
        transitionFactor = (time - 5) / 1;
        currentSkyColor = lerpColor(colors.DEEP_NIGHT_SKY_COLOR, colors.DAWN_SKY_COLOR, transitionFactor);
    } else if (time >= 6 && time < 7) { // Sunrise (06:00 - 07:00) - Pinkish tint
        transitionFactor = (time - 6) / 1;
        currentSkyColor = lerpColor(colors.DAWN_SKY_COLOR, colors.SUNRISE_TINT_COLOR, transitionFactor);
    } else if (time >= 7 && time < 9) { // Morning (07:00 - 09:00) - Transition from pink to morning blue
        transitionFactor = (time - 7) / 2;
        currentSkyColor = lerpColor(colors.SUNRISE_TINT_COLOR, colors.MORNING_SKY_COLOR, transitionFactor);
    } else if (time >= 9 && time < 16) { // Midday (09:00 - 16:00)
        currentSkyColor = colors.MORNING_SKY_COLOR;
    } else if (time >= 16 && time < 18) { // Afternoon (16:00 - 18:00)
        transitionFactor = (time - 16) / 2;
        currentSkyColor = lerpColor(colors.MORNING_SKY_COLOR, colors.AFTERNOON_SKY_COLOR, transitionFactor);
    } else if (time >= 18 && time < 19) { // Sunset (18:00 - 19:00) - Orange/Red tint
        transitionFactor = (time - 18) / 1;
        currentSkyColor = lerpColor(colors.AFTERNOON_SKY_COLOR, colors.SUNSET_TINT_COLOR, transitionFactor);
    } else if (time >= 19 && time < 21) { // Dusk (19:00 - 21:00) - Transition from orange/red to deep night
        transitionFactor = (time - 19) / 2;
        currentSkyColor = lerpColor(colors.SUNSET_TINT_COLOR, colors.DEEP_NIGHT_SKY_COLOR, transitionFactor);
    } else { // Early Night (21:00 - 24:00)
        currentSkyColor = colors.DEEP_NIGHT_SKY_COLOR;
    }
    return currentSkyColor;
};

// Function to get current ambient light factor (for ground, objects)
export const getAmbientLightFactor = (time) => {
    let lightFactor;

    if (time >= 5 && time < 7) {
        lightFactor = 0.1 + (time - 5) / 2 * 0.4;
    } else if (time >= 7 && time < 9) {
        lightFactor = 0.5 + (time - 7) / 2 * 0.5;
    } else if (time >= 9 && time < 17) {
        lightFactor = 1;
    } else if (time >= 17 && time < 19) {
        lightFactor = 1 - (time - 17) / 2 * 0.5;
    } else if (time >= 19 && time < 21) {
        lightFactor = 0.5 - (time - 19) / 2 * 0.4;
    } else {
        lightFactor = 0.1;
    }
    return lightFactor;
};

// Function to update entity position and handle basic collisions
export const updateEntityPosition = (entity, world, WORLD_WIDTH_TILES) => {
    let newEntity = { ...entity };
    newEntity.vy += GRAVITY;
    newEntity.y += newEntity.vy;
    newEntity.x += newEntity.vx;
    newEntity.onGround = false;

    if (newEntity.x < 0) newEntity.x = 0;
    if (newEntity.x + newEntity.width > WORLD_WIDTH_PIXELS) newEntity.x = WORLD_WIDTH_PIXELS - newEntity.width;

    const leftTile = Math.floor(newEntity.x / TILE_SIZE);
    const rightTile = Math.floor((newEntity.x + newEntity.width - 1) / TILE_SIZE);
    const topTile = Math.floor(newEntity.y / TILE_SIZE);
    const bottomTile = Math.floor((newEntity.y + newEntity.height - 1) / TILE_SIZE);

    for (let y = topTile; y <= bottomTile; y++) {
        for (let x = leftTile; x <= rightTile; x++) {
            if (x >= 0 && x < WORLD_WIDTH_TILES && y >= 0 && y < world.length) {
                const tile = world[y][x];
                if (tile.type !== TILE_TYPE.SKY) {
                    const tileTop = y * TILE_SIZE;
                    const tileBottom = tileTop + TILE_SIZE;
                    const tileLeft = x * TILE_SIZE;
                    const tileRight = tileLeft + TILE_SIZE;

                    if (newEntity.x < tileRight && newEntity.x + newEntity.width > tileLeft &&
                        newEntity.y < tileBottom && newEntity.y + newEntity.height > tileTop) {

                        if (newEntity.vy > 0 && newEntity.y + newEntity.height <= tileBottom && newEntity.y + newEntity.height >= tileTop) {
                            newEntity.y = tileTop - newEntity.height;
                            newEntity.vy = 0;
                            newEntity.onGround = true;
                        } else if (newEntity.vy < 0) {
                            newEntity.y = tileBottom;
                            newEntity.vy = 0;
                        } else if (newEntity.vx > 0) {
                            newEntity.x = tileLeft - newEntity.width;
                            newEntity.vx = 0;
                        } else if (newEntity.vx < 0) {
                            newEntity.x = tileRight;
                            newEntity.vx = 0;
                        }
                    }
                }
            }
        }
    }
    return newEntity;
};

// --- SVG Icons (previously in assets/icons.js) ---
export const WheatIcon = ({ size = 16, color = '#FFD700' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L12 22M12 2L15 6M12 2L9 6M12 22L9 18M12 22L15 18" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M10 10C10 11.1046 10.8954 12 12 12C13.1046 12 14 11.1046 14 10C14 8.89543 13.1046 8 12 8C10.8954 8 10 8.89543 10 10Z" fill={color}/>
    </svg>
);

export const CornIcon = ({ size = 16, color = '#FFD700' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2V22M12 2C10 2 9 4 9 6C9 8 10 10 12 10C14 10 15 8 15 6C15 4 14 2 12 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 10C10 10 9 12 9 14C9 16 10 18 12 18C14 18 15 16 15 14C15 12 14 10 12 10Z" fill={color}/>
        <path d="M12 18C10 18 9 20 9 22H15C15 20 14 18 12 18Z" fill={color}/>
    </svg>
);

export const PotatoIcon = ({ size = 16, color = '#A0522D' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="12" cy="12" rx="8" ry="6" fill={color}/>
        <circle cx="8" cy="10" r="1.5" fill="#8B4513"/>
        <circle cx="16" cy="14" r="1.5" fill="#8B4513"/>
        <circle cx="10" cy="16" r="1" fill="#8B4513"/>
    </svg>
);

export const SeedIcon = ({ size = 16, color = '#8B4513' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L10 6L12 10L14 6L12 2Z" fill={color} stroke="#5C4033" strokeWidth="1"/>
        <path d="M12 10L10 14L12 18L14 14L12 10Z" fill={color} stroke="#5C4033" strokeWidth="1"/>
        <path d="M12 18L10 22L12 24L14 22L12 18Z" fill={color} stroke="#5C4033" strokeWidth="1"/>
    </svg>
);

export const CropSeedIcon = ({ cropType, size = 16 }) => {
    switch (cropType) {
        case 'wheat': return <SeedIcon size={size} color="#A0522D" />;
        case 'corn': return <SeedIcon size={size} color="#8B4513" />;
        case 'potato': return <SeedIcon size={size} color="#6F4E37" />;
        default: return null;
    }
};

export const CropIcon = ({ cropType, size = 16 }) => {
    switch (cropType) {
        case 'wheat': return <WheatIcon size={size} />;
        case 'corn': return <CornIcon size={size} />;
        case 'potato': return <PotatoIcon size={size} />;
        default: return null;
    }
};


// --- Game Context (previously in context/GameContext.js) ---
const GameContext = createContext();

export const GameProvider = ({ children }) => {
    const animationFrameId = useRef(null);
    const lastFlyingObjectTimeRef = useRef(0);

    // Firebase state
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // Image assets
    const tractorImageRef = useRef(new Image());
    const [tractorImageLoaded, setTractorImageLoaded] = useState(false);

    // --- Game State ---
    const [player, setPlayer] = useState({
        x: WORLD_WIDTH_PIXELS / 4, y: TILE_SIZE * 14,
        width: TILE_SIZE * 0.9, height: TILE_SIZE * 1.8,
        speed: 3, jumpPower: 10,
        vx: 0, vy: 0, onGround: false,
        isInVehicle: false, facing: 'right',
        inventory: { wheatSeeds: 50, cornSeeds: 20, potatoSeeds: 20, wheat: 0, corn: 0, potato: 0 },
        money: 100,
        maxStorage: 100, // Initial max storage for crops
        siloBuilt: false,
    });

    const [tractor, setTractor] = useState({
        x: WORLD_WIDTH_PIXELS / 4 + 100, y: TILE_SIZE * 14,
        width: TILE_SIZE * 4, // Adjusted width for the image
        height: TILE_SIZE * 2.5, // Adjusted height for the image
        speed: VEHICLE_UPGRADE_TIERS.tractor[0].speed, // Use base speed from tiers
        jumpPower: 10, // Not applicable, but keeping structure
        vx: 0, vy: 0, onGround: false,
        equipment: null, isInVehicle: false, type: 'tractor', facing: 'right',
        fuel: VEHICLE_UPGRADE_TIERS.tractor[0].maxFuel, // Use base maxFuel
        maxFuel: VEHICLE_UPGRADE_TIERS.tractor[0].maxFuel, // Use base maxFuel
        fuelConsumption: 0.05,
        upgradeLevel: 0, // Current upgrade level
    });

    const [plow, setPlow] = useState({
        x: 0, y: 0, // Initialized with dummy values, will be set in generateWorld
        width: TILE_SIZE * 3, height: TILE_SIZE * 1.5,
        vx: 0, vy: 0, onGround: false, isHitched: false, type: 'plow'
    });

    const [seeder, setSeeder] = useState({
        x: 0, y: 0, // Initialized with dummy values, will be set in generateWorld
        width: TILE_SIZE * 3.5, height: TILE_SIZE * 1.8,
        vx: 0, vy: 0, onGround: false, isHitched: false, type: 'seeder'
    });

    const [combineHarvester, setCombineHarvester] = useState({
        x: WORLD_WIDTH_PIXELS / 2 + 200, y: TILE_SIZE * 14,
        width: TILE_SIZE * 5, height: TILE_SIZE * 3,
        speed: VEHICLE_UPGRADE_TIERS.combineHarvester[0].speed, // Use base speed from tiers
        jumpPower: 10, // Not applicable
        vx: 0, vy: 0, onGround: false,
        isHitched: false, isInVehicle: false, type: 'combine harvester', facing: 'right',
        fuel: VEHICLE_UPGRADE_TIERS.combineHarvester[0].maxFuel, // Use base maxFuel
        maxFuel: VEHICLE_UPGRADE_TIERS.combineHarvester[0].maxFuel, // Use base maxFuel
        fuelConsumption: 0.07,
        upgradeLevel: 0, // Current upgrade level
    });

    const [world, setWorld] = useState([]);
    const [trees, setTrees] = useState([]);
    const [barns, setBarns] = useState([]);
    const [silos, setSilos] = useState([]); // State for silos
    const [clouds, setClouds] = useState([]);
    const [birds, setBirds] = useState([]);
    const [planes, setPlanes] = useState([]);
    const [balloons, setBalloons] = useState([]);
    const [particles, setParticles] = useState([]); // New state for particles

    const [gameTime, setGameTime] = useState(12); // Start at mid-day
    const [cameraX, setCameraX] = useState(0);
    const [cameraY, setCameraY] = useState(0);
    const [keys, setKeys] = useState({});
    const [statusMessage, setStatusMessage] = useState('');
    const [statusVisible, setStatusVisible] = useState(false);
    const [selectedCropType, setSelectedCropType] = useState(CROP_TYPE.WHEAT); // Default selected crop
    const [isShopOpen, setIsShopOpen] = useState(false); // State for shop modal
    const [isSettingsOpen, setIsSettingsOpen] = useState(false); // State for settings modal

    // Money change feedback state
    const [moneyChangeAmount, setMoneyChangeAmount] = useState(0);
    const [moneyChangeVisible, setMoneyChangeVisible] = useState(false);
    const [moneyChangePosition, setMoneyChangePosition] = useState({ x: 0, y: 0 });

    // Moved sun and moon to state
    const [sunState, setSunState] = useState({
        radius: TILE_SIZE * 1.5,
        color: '#FFFACD',
        x: WORLD_WIDTH_PIXELS / 2, y: WORLD_HEIGHT_PIXELS / 4, // Initial position
        visible: false
    });

    const [moonState, setMoonState] = useState({
        radius: TILE_SIZE * 1.2,
        color: '#F0F8FF',
        x: WORLD_WIDTH_PIXELS / 2, y: WORLD_HEIGHT_PIXELS / 4, // Initial position
        visible: false
    });

    // --- Utility Functions (exposed via context) ---
    const showStatus = useCallback((message, duration) => {
        setStatusMessage(message);
        setStatusVisible(true);
        setTimeout(() => {
            setStatusVisible(false);
        }, duration);
    }, []);

    const triggerMoneyChange = useCallback((amount) => {
        setMoneyChangeAmount(amount);
        setMoneyChangePosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
        setMoneyChangeVisible(true);
        setTimeout(() => {
            setMoneyChangeVisible(false);
        }, 1500);
    }, []);

    const createParticles = useCallback((x, y, count, color, sizeMin, sizeMax, speedMin, speedMax, lifetime, spreadX = TILE_SIZE, spreadY = TILE_SIZE / 2) => {
        setParticles(prevParticles => {
            const newParticles = [...prevParticles];
            for (let i = 0; i < count; i++) {
                newParticles.push({
                    id: Date.now() + Math.random(),
                    x: x + Math.random() * spreadX - spreadX / 2,
                    y: y + Math.random() * spreadY - spreadY / 2,
                    vx: (Math.random() - 0.5) * (speedMax - speedMin) + speedMin,
                    vy: (Math.random() - 0.5) * (speedMax - speedMin) + speedMin,
                    color: color,
                    size: Math.random() * (sizeMax - sizeMin) + sizeMin,
                    lifetime: lifetime,
                    creationTime: Date.now(),
                });
            }
            return newParticles;
        });
    }, []);

    // --- Firebase Initialization ---
    useEffect(() => {
        try {
            const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

            if (Object.keys(firebaseConfig).length === 0) {
                console.error("Firebase config is missing. Cannot initialize Firebase.");
                showStatus("Firebase not configured. Save/Load disabled.", 3000);
                return;
            }

            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestoreDb);
            setAuth(firebaseAuth);

            onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    try {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            await signInWithCustomToken(firebaseAuth, __initial_auth_token);
                        } else {
                            await signInAnonymously(firebaseAuth);
                        }
                    } catch (error) {
                        console.error("Firebase anonymous sign-in failed:", error);
                        showStatus("Authentication failed. Save/Load disabled.", 3000);
                    }
                }
            });
        } catch (error) {
            console.error("Error initializing Firebase:", error);
            showStatus("Firebase initialization error. Save/Load disabled.", 3000);
        }
    }, [showStatus]);

    // --- Image Loading Effect ---
    useEffect(() => {
        const img = tractorImageRef.current;
        img.src = 'https://i.imgur.com/QLQX86R.png'; // Your tractor image URL
        img.onload = () => {
            setTractorImageLoaded(true);
        };
        img.onerror = () => {
            console.error("Failed to load tractor image.");
            showStatus("Failed to load tractor image. Using fallback drawing.", 3000);
            setTractorImageLoaded(false);
        };
    }, [showStatus]);

    // --- Save/Load Game Functions ---
    const saveGame = useCallback(async () => {
        if (!db || !userId) {
            showStatus("Cannot save: Firebase not ready or user not authenticated.", 2000);
            return;
        }

        try {
            const serializedWorld = JSON.stringify(world.map(row => row.map(tile => {
                if (tile.crop) {
                    return { ...tile, crop: { ...tile.crop, plantedTime: tile.crop.plantedTime.valueOf() } };
                }
                return tile;
            })));

            const gameData = {
                player: { ...player, inventory: { ...player.inventory } },
                tractor: { ...tractor, equipment: tractor.equipment ? { ...tractor.equipment } : null },
                plow: { ...plow },
                seeder: { ...seeder },
                combineHarvester: { ...combineHarvester },
                world: serializedWorld,
                trees: [...trees],
                barns: [...barns],
                silos: [...silos],
                clouds: [...clouds],
                birds: [...birds],
                planes: [...planes],
                balloons: [...balloons],
                gameTime: gameTime,
                cameraX: cameraX,
                cameraY: cameraY,
                selectedCropType: selectedCropType,
                isShopOpen: isShopOpen,
                sunState: { ...sunState },
                moonState: { ...moonState },
            };

            const docRef = doc(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/gameStates`, SAVE_GAME_DOC_ID);
            await setDoc(docRef, gameData);
            showStatus("Game saved successfully!", 1500);
        } catch (error) {
            console.error("Error saving game:", error);
            showStatus("Failed to save game.", 2000);
        }
    }, [db, userId, player, tractor, plow, seeder, combineHarvester, world, trees, barns, silos, clouds, birds, planes, balloons, gameTime, cameraX, cameraY, selectedCropType, isShopOpen, sunState, moonState, showStatus]);

    const loadGame = useCallback(async () => {
        if (!db || !userId) {
            showStatus("Cannot load: Firebase not ready or user not authenticated.", 2000);
            return;
        }

        try {
            const docRef = doc(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${userId}/gameStates`, SAVE_GAME_DOC_ID);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const loadedData = docSnap.data();

                setPlayer(loadedData.player);
                setTractor(loadedData.tractor);
                setPlow(loadedData.plow);
                setSeeder(loadedData.seeder);
                setCombineHarvester(loadedData.combineHarvester);

                const loadedWorld = JSON.parse(loadedData.world).map(row => row.map(tile => {
                    if (tile.crop && typeof tile.crop.plantedTime === 'number') {
                        return { ...tile, crop: { ...tile.crop, plantedTime: new Date(tile.crop.plantedTime) } };
                    }
                    return tile;
                }));
                setWorld(loadedWorld);

                setTrees(loadedData.trees);
                setBarns(loadedData.barns);
                setSilos(loadedData.silos);
                setClouds(loadedData.clouds);
                setBirds(loadedData.birds);
                setPlanes(loadedData.planes);
                setBalloons(loadedData.balloons);
                setGameTime(loadedData.gameTime);
                setCameraX(loadedData.cameraX);
                setCameraY(loadedData.cameraY);
                setSelectedCropType(loadedData.selectedCropType);
                setIsShopOpen(loadedData.isShopOpen);
                setSunState(loadedData.sunState);
                setMoonState(loadedData.moonState);

                showStatus("Game loaded successfully!", 1500);
            } else {
                showStatus("No saved game found.", 2000);
            }
        } catch (error) {
            console.error("Error loading game:", error);
            showStatus("Failed to load game.", 2000);
        }
    }, [db, userId, showStatus]);

    // --- Game Logic Handlers ---
    const handlePlayerMovement = useCallback(() => {
        setPlayer(prevPlayer => {
            if (prevPlayer.isInVehicle) return prevPlayer;

            let newVx = 0;
            let newFacing = prevPlayer.facing;
            if (keys['a'] || keys['arrowleft']) {
                newVx = -prevPlayer.speed;
                newFacing = 'left';
            } else if (keys['d'] || keys['arrowright']) {
                newVx = prevPlayer.speed;
                newFacing = 'right';
            }

            let newVy = prevPlayer.vy;
            let newOnGround = prevPlayer.onGround;
            if ((keys['w'] || keys['arrowup']) && prevPlayer.onGround) {
                newVy = -prevPlayer.jumpPower;
                newOnGround = false;
            }

            return { ...prevPlayer, vx: newVx, vy: newVy, onGround: newOnGround, facing: newFacing };
        });
    }, [keys]);

    const handleTractorMovement = useCallback(() => {
        setTractor(prevTractor => {
            if (!prevTractor.isInVehicle) return { ...prevTractor, vx: 0 };

            let newVx = 0;
            let newFuel = prevTractor.fuel;
            let newFacing = prevTractor.facing;

            const isMovingKey = keys['a'] || keys['arrowleft'] || keys['d'] || keys['arrowright'];

            if (prevTractor.fuel <= 0 && isMovingKey) {
                showStatus("Tractor out of fuel!", 1000);
                return { ...prevTractor, vx: 0 };
            }

            if (keys['a'] || keys['arrowleft']) {
                newVx = -prevTractor.speed;
                newFacing = 'left';
                newFuel = Math.max(0, prevTractor.fuel - prevTractor.fuelConsumption);
            } else if (keys['d'] || keys['arrowright']) {
                newVx = prevTractor.speed;
                newFacing = 'right';
                newFuel = Math.max(0, prevTractor.fuel - prevTractor.fuelConsumption);
            }

            return { ...prevTractor, vx: newVx, fuel: newFuel, facing: newFacing };
        });
    }, [keys, showStatus]);

    const handleCombineMovement = useCallback(() => {
        setCombineHarvester(prevCombine => {
            if (!prevCombine.isInVehicle) return { ...prevCombine, vx: 0 };

            let newVx = 0;
            let newFuel = prevCombine.fuel;
            let newFacing = prevCombine.facing;

            const isMovingKey = keys['a'] || keys['arrowleft'] || keys['d'] || keys['arrowright'];

            if (prevCombine.fuel <= 0 && isMovingKey) {
                showStatus("Combine out of fuel!", 1000);
                return { ...prevCombine, vx: 0 };
            }

            if (keys['a'] || keys['arrowleft']) {
                newVx = -prevCombine.speed;
                newFacing = 'left';
                newFuel = Math.max(0, prevCombine.fuel - prevCombine.fuelConsumption);
            } else if (keys['d'] || keys['arrowright']) {
                newVx = prevCombine.speed;
                newFacing = 'right';
                newFuel = Math.max(0, prevCombine.fuel - prevCombine.fuelConsumption);
            }

            return { ...prevCombine, vx: newVx, fuel: newFuel, facing: newFacing };
        });
    }, [keys, showStatus]);

    const handleEnterExitVehicle = useCallback(() => {
        setPlayer(prevPlayer => {
            let newPlayer = { ...prevPlayer };
            let currentTractor = tractor;
            let currentCombineHarvester = combineHarvester;

            if (newPlayer.isInVehicle) {
                let currentVehicle = null;
                if (currentTractor.isInVehicle) currentVehicle = currentTractor;
                else if (currentCombineHarvester.isInVehicle) currentVehicle = currentCombineHarvester;

                if (currentVehicle) {
                    newPlayer.isInVehicle = false;
                    if (currentVehicle.type === 'tractor') {
                        setTractor(prev => ({ ...prev, isInVehicle: false }));
                    } else if (currentVehicle.type === 'combine harvester') {
                        setCombineHarvester(prev => ({ ...prev, isInVehicle: false }));
                    }

                    const groundStartRow = Math.floor(WORLD_HEIGHT_TILES * 0.75);
                    const groundLevelY = groundStartRow * TILE_SIZE;
                    newPlayer.x = currentVehicle.x + (currentVehicle.width / 2) - (newPlayer.width / 2);
                    newPlayer.y = groundLevelY - newPlayer.height;
                    newPlayer.vx = 0;
                    newPlayer.vy = 0;
                    newPlayer.onGround = false;
                    showStatus(`Exited ${currentVehicle.type.charAt(0).toUpperCase() + currentVehicle.type.slice(1)}`, 1500);
                }
            } else {
                let closestVehicle = null;
                let minDistance = Infinity;
                const enterRange = 80;

                for (const vehicle of [currentTractor, currentCombineHarvester]) {
                    const distance = Math.sqrt(
                        Math.pow(newPlayer.x - vehicle.x, 2) +
                        Math.pow(newPlayer.y - vehicle.y, 2)
                    );
                    if (distance < minDistance && distance < enterRange) {
                        minDistance = distance;
                        closestVehicle = vehicle;
                    }
                }

                if (closestVehicle) {
                    newPlayer.isInVehicle = true;
                    if (closestVehicle.type === 'tractor') {
                        setTractor(prev => ({ ...prev, isInVehicle: true }));
                    } else if (closestVehicle.type === 'combine harvester') {
                        setCombineHarvester(prev => ({ ...prev, isInVehicle: true }));
                    }
                    newPlayer.x = closestVehicle.x + (closestVehicle.width / 2);
                    newPlayer.y = closestVehicle.y + (closestVehicle.height / 2);
                    showStatus(`Entered ${closestVehicle.type.charAt(0).toUpperCase() + closestVehicle.type.slice(1)}`, 1500);
                } else {
                    showStatus("No vehicle close enough to enter!", 1000);
                }
            }
            return newPlayer;
        });
    }, [tractor, combineHarvester, showStatus, setTractor, setCombineHarvester]);

    const handleHitchClosestAttachment = useCallback(() => {
        setTractor(prevTractor => {
            if (!prevTractor.isInVehicle) {
                showStatus("Must be in tractor to hitch attachments!", 1000);
                return prevTractor;
            }

            let newTractor = { ...prevTractor };
            let currentPlow = plow;
            let currentSeeder = seeder;

            if (newTractor.equipment) {
                if (newTractor.equipment.type === 'plow') setPlow(prev => ({ ...prev, isHitched: false }));
                else if (newTractor.equipment.type === 'seeder') setSeeder(prev => ({ ...prev, isHitched: false }));
                showStatus(`${newTractor.equipment.type.charAt(0).toUpperCase() + newTractor.equipment.type.slice(1)} Detached`, 1500);
                newTractor.equipment = null;
            } else {
                let closestAttachment = null;
                let minDistance = Infinity;
                const hitchRange = 60;

                for (const attachment of [currentPlow, currentSeeder]) {
                    if (!attachment.isHitched) {
                        const distance = Math.abs(newTractor.x - attachment.x);
                        if (distance < minDistance && distance < hitchRange) {
                            minDistance = distance;
                            closestAttachment = attachment;
                        }
                    }
                }

                if (closestAttachment) {
                    if (closestAttachment.type === 'plow') {
                        setPlow(prev => ({ ...prev, isHitched: true }));
                        newTractor.equipment = closestAttachment;
                    } else if (closestAttachment.type === 'seeder') {
                        setSeeder(prev => ({ ...prev, isHitched: true }));
                        newTractor.equipment = closestAttachment;
                    }
                    showStatus(`${closestAttachment.type.charAt(0).toUpperCase() + closestAttachment.type.slice(1)} Attached`, 1500);
                } else {
                    showStatus("No attachment close enough to hitch!", 1000);
                }
            }
            return newTractor;
        });
    }, [plow, seeder, showStatus, setPlow, setSeeder]);

    const handleTillSoil = useCallback(() => {
        setPlayer(prevPlayer => {
            if (prevPlayer.isInVehicle) return prevPlayer;
            if (world.length === 0) return prevPlayer;

            const tileX = Math.floor((prevPlayer.x + prevPlayer.width / 2) / TILE_SIZE);
            const tileY = Math.floor((prevPlayer.y + prevPlayer.height) / TILE_SIZE);

            if (tileY < WORLD_HEIGHT_TILES && tileX < WORLD_WIDTH_TILES) {
                const newWorld = world.map((row, y) =>
                    row.map((tile, x) => {
                        if (x === tileX && y === tileY && (tile.type === TILE_TYPE.GRASS || tile.type === TILE_TYPE.DIRT)) {
                            showStatus("Tilled soil", 1000);
                            createParticles(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 10, '#D2B48C', 2, 5, -1, 1, 500);
                            return { ...tile, type: TILE_TYPE.TILLED };
                        }
                        return tile;
                    })
                );
                setWorld(newWorld);
            }
            return prevPlayer;
        });
    }, [world, showStatus, createParticles]);

    const handlePlantCrop = useCallback(() => {
        setPlayer(prevPlayer => {
            if (prevPlayer.isInVehicle) return prevPlayer;
            if (world.length === 0) return prevPlayer;

            const tileX = Math.floor((prevPlayer.x + prevPlayer.width / 2) / TILE_SIZE);
            const tileY = Math.floor((prevPlayer.y + prevPlayer.height) / TILE_SIZE);

            if (tileY < WORLD_HEIGHT_TILES && tileX < WORLD_WIDTH_TILES) {
                const tile = world[tileY][tileX];
                if (tile.type === TILE_TYPE.TILLED && !tile.crop) {
                    let seedInventoryKey;
                    let seedColor;
                    if (selectedCropType === CROP_TYPE.WHEAT) { seedInventoryKey = 'wheatSeeds'; seedColor = '#A0522D'; }
                    else if (selectedCropType === CROP_TYPE.CORN) { seedInventoryKey = 'cornSeeds'; seedColor = '#8B4513'; }
                    else if (selectedCropType === CROP_TYPE.POTATO) { seedInventoryKey = 'potatoSeeds'; seedColor = '#6F4E37'; }

                    if (prevPlayer.inventory[seedInventoryKey] > 0) {
                        const newWorld = world.map((row, y) =>
                            row.map((t, x) => {
                                if (x === tileX && y === tileY) {
                                    showStatus(`${selectedCropType.charAt(0).toUpperCase() + selectedCropType.slice(1)} planted!`, 1500);
                                    createParticles(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 5, seedColor, 3, 6, -0.5, 0.5, 700);
                                    return {
                                        ...t,
                                        type: TILE_TYPE.CROP_PLANTED,
                                        crop: {
                                            type: selectedCropType,
                                            stage: CROP_STAGE.SEED,
                                            plantedTime: Date.now(),
                                        }
                                    };
                                }
                                return t;
                            })
                        );
                        setWorld(newWorld);
                        return {
                            ...prevPlayer,
                            inventory: {
                                ...prevPlayer.inventory,
                                [seedInventoryKey]: prevPlayer.inventory[seedInventoryKey] - 1
                            }
                        };
                    } else {
                        showStatus(`No ${selectedCropType.replace('Seeds', '')} seeds!`, 1000);
                    }
                } else if (tile.crop) {
                    showStatus("Already something here!", 1000);
                } else {
                    showStatus("Needs tilled soil!", 1000);
                }
            }
            return prevPlayer;
        });
    }, [world, showStatus, selectedCropType, createParticles]);

    const handleHarvestCrop = useCallback(() => {
        setPlayer(prevPlayer => {
            if (prevPlayer.isInVehicle) return prevPlayer;
            if (world.length === 0) return prevPlayer;

            const tileX = Math.floor((prevPlayer.x + prevPlayer.width / 2) / TILE_SIZE);
            const tileY = Math.floor((prevPlayer.y + prevPlayer.height) / TILE_SIZE);

            if (tileY < WORLD_HEIGHT_TILES && tileX < WORLD_WIDTH_TILES) {
                const tile = world[tileY][tileX];
                if (tile.type === TILE_TYPE.CROP_GROWN && tile.crop && tile.crop.stage === CROP_STAGE.MATURE) {
                    const harvestedCropType = tile.crop.type;
                    const currentCropCount = prevPlayer.inventory[harvestedCropType] || 0;

                    if (currentCropCount < prevPlayer.maxStorage) {
                        const newWorld = world.map((row, y) =>
                            row.map((t, x) => {
                                if (x === tileX && y === tileY) {
                                    showStatus(`Harvested ${harvestedCropType.charAt(0).toUpperCase() + harvestedCropType.slice(1)}!`, 1500);
                                    const harvestColor = TILE_COLORS[harvestedCropType][CROP_STAGE.MATURE];
                                    createParticles(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 15, harvestColor, 4, 8, -1.5, 1.5, 800);
                                    return { ...t, type: TILE_TYPE.TILLED, crop: null };
                                }
                                return t;
                            })
                        );
                        setWorld(newWorld);
                        return {
                            ...prevPlayer,
                            inventory: {
                                ...prevPlayer.inventory,
                                [harvestedCropType]: prevPlayer.inventory[harvestedCropType] + 1
                            }
                        };
                    } else {
                        showStatus("Storage full! Sell crops to make space.", 1500);
                    }
                } else if (tile.crop && tile.crop.stage !== CROP_STAGE.MATURE) {
                    showStatus("Crop not mature yet!", 1000);
                } else {
                    showStatus("Nothing to harvest here!", 1000);
                }
            }
            return prevPlayer;
        });
    }, [world, showStatus, createParticles, TILE_COLORS, CROP_STAGE]);

    const applyPlowAction = useCallback(() => {
        if (tractor.equipment?.type !== 'plow' || tractor.vx === 0 || tractor.fuel <= 0) return;
        if (world.length === 0) return;

        const plowY = Math.floor((plow.y + plow.height) / TILE_SIZE);
        setWorld(prevWorld => {
            const newWorld = prevWorld.map(row => [...row]);
            for (let i = 0; i < plow.width / TILE_SIZE; i++) {
                const plowX = Math.floor((plow.x + i * TILE_SIZE) / TILE_SIZE);

                if (plowY < WORLD_HEIGHT_TILES && plowX >= 0 && plowX < WORLD_WIDTH_TILES) {
                    const tile = newWorld[plowY][plowX];
                    if ((tile.type === TILE_TYPE.GRASS || tile.type === TILE_TYPE.DIRT) && !tile.crop) {
                        newWorld[plowY][plowX] = { ...tile, type: TILE_TYPE.TILLED };
                        createParticles(plowX * TILE_SIZE + TILE_SIZE / 2, plowY * TILE_SIZE + TILE_SIZE / 2, 5, '#D2B48C', 1, 3, -0.8, 0.8, 400);
                    }
                }
            }
            return newWorld;
        });
    }, [tractor.equipment, tractor.vx, tractor.fuel, plow.y, plow.height, plow.width, world, createParticles]);

    const applySeederAction = useCallback(() => {
        if (tractor.equipment?.type !== 'seeder' || tractor.vx === 0 || tractor.fuel <= 0) return;
        if (world.length === 0) return;

        const seederY = Math.floor((seeder.y + seeder.height) / TILE_SIZE);
        setWorld(prevWorld => {
            const newWorld = prevWorld.map(row => [...row]);
            let seedsConsumed = 0;
            for (let i = 0; i < seeder.width / TILE_SIZE; i++) {
                const seederX = Math.floor((seeder.x + i * TILE_SIZE) / TILE_SIZE);

                if (seederY < WORLD_HEIGHT_TILES && seederX >= 0 && seederX < WORLD_WIDTH_TILES) {
                    const tile = newWorld[seederY][seederX];
                    if (tile.type === TILE_TYPE.TILLED && !tile.crop) {
                        let seedInventoryKey;
                        let seedColor;
                        if (selectedCropType === CROP_TYPE.WHEAT) { seedInventoryKey = 'wheatSeeds'; seedColor = '#A0522D'; }
                        else if (selectedCropType === CROP_TYPE.CORN) { seedInventoryKey = 'cornSeeds'; seedColor = '#8B4513'; }
                        else if (selectedCropType === CROP_TYPE.POTATO) { seedInventoryKey = 'potatoSeeds'; seedColor = '#6F4E37'; }

                        if (player.inventory[seedInventoryKey] - seedsConsumed > 0) {
                            newWorld[seederY][seederX] = {
                                ...tile,
                                type: TILE_TYPE.CROP_PLANTED,
                                crop: {
                                    type: selectedCropType,
                                    stage: CROP_STAGE.SEED,
                                    plantedTime: Date.now(),
                                }
                            };
                            seedsConsumed++;
                            createParticles(seederX * TILE_SIZE + TILE_SIZE / 2, seederY * TILE_SIZE + TILE_SIZE / 2, 3, seedColor, 2, 4, -0.3, 0.3, 600);
                        } else {
                            showStatus(`No ${selectedCropType.replace('Seeds', '')} seeds to plant!`, 100);
                        }
                    }
                }
            }
            if (seedsConsumed > 0) {
                setPlayer(prev => ({
                    ...prev,
                    inventory: {
                        ...prev.inventory,
                        [selectedCropType + 'Seeds']: prev.inventory[selectedCropType + 'Seeds'] - seedsConsumed
                    }
                }));
            }
            return newWorld;
        });
    }, [tractor.equipment, tractor.vx, tractor.fuel, seeder.y, seeder.height, seeder.width, player.inventory, selectedCropType, showStatus, world, createParticles, CROP_TYPE]);

    const applyCombineAction = useCallback(() => {
        if (!combineHarvester.isInVehicle || combineHarvester.vx === 0 || combineHarvester.fuel <= 0) return;
        if (world.length === 0) return;

        const combineY = Math.floor((combineHarvester.y + combineHarvester.height) / TILE_SIZE);
        const headerWidth = TILE_SIZE * 2;
        let startX, endX;

        if (combineHarvester.facing === 'right') {
            startX = Math.floor((combineHarvester.x + combineHarvester.width) / TILE_SIZE);
            endX = Math.floor((combineHarvester.x + combineHarvester.width + headerWidth) / TILE_SIZE);
        } else {
            startX = Math.floor((combineHarvester.x - headerWidth) / TILE_SIZE);
            endX = Math.floor(combineHarvester.x / TILE_SIZE);
        }

        setWorld(prevWorld => {
            const newWorld = prevWorld.map(row => [...row]);
            let harvestedCount = { wheat: 0, corn: 0, potato: 0 };

            for (let x = Math.min(startX, endX); x < Math.max(startX, endX); x++) {
                if (combineY < WORLD_HEIGHT_TILES && x >= 0 && x < WORLD_WIDTH_TILES) {
                    const tile = newWorld[combineY][x];
                    if (tile.type === TILE_TYPE.CROP_GROWN && tile.crop && tile.crop.stage === CROP_STAGE.MATURE) {
                        const currentCropCount = player.inventory[tile.crop.type] || 0;
                        if (currentCropCount + harvestedCount[tile.crop.type] < player.maxStorage) {
                            harvestedCount[tile.crop.type]++;
                            newWorld[combineY][x] = { ...tile, type: TILE_TYPE.TILLED, crop: null };
                            const harvestColor = TILE_COLORS[tile.crop.type][CROP_STAGE.MATURE];
                            createParticles(x * TILE_SIZE + TILE_SIZE / 2, combineY * TILE_SIZE + TILE_SIZE / 2, 8, harvestColor, 3, 7, -1, 1, 600);
                        } else {
                            showStatus("Storage full! Cannot harvest more.", 1500);
                            break;
                        }
                    }
                }
            }

            if (harvestedCount.wheat > 0 || harvestedCount.corn > 0 || harvestedCount.potato > 0) {
                setPlayer(prev => ({
                    ...prev,
                    inventory: {
                        ...prev.inventory,
                        wheat: prev.inventory.wheat + harvestedCount.wheat,
                        corn: prev.inventory.corn + harvestedCount.corn,
                        potato: prev.inventory.potato + harvestedCount.potato,
                    }
                }));
                showStatus("Harvested with combine!", 1500);
            }
            return newWorld;
        });
    }, [combineHarvester.isInVehicle, combineHarvester.vx, combineHarvester.fuel, combineHarvester.facing, combineHarvester.y, combineHarvester.height, combineHarvester.width, showStatus, world, player.inventory, player.maxStorage, createParticles, TILE_COLORS, CROP_STAGE]);

    const updateCropGrowth = useCallback(() => {
        const now = Date.now();
        if (world.length === 0) return;

        setWorld(prevWorld => {
            const newWorld = prevWorld.map(row => [...row]);
            for (let y = 0; y < WORLD_HEIGHT_TILES; y++) {
                for (let x = 0; x < WORLD_WIDTH_TILES; x++) {
                    const tile = newWorld[y][x];
                    if (tile.crop && tile.type === TILE_TYPE.CROP_PLANTED) {
                        const timeElapsed = now - tile.crop.plantedTime;
                        if (timeElapsed >= GROWTH_TIME_PER_STAGE * (tile.crop.stage + 1)) {
                            const newStage = tile.crop.stage + 1;
                            newWorld[y][x] = {
                                ...tile,
                                crop: { ...tile.crop, stage: newStage },
                                type: newStage >= CROP_STAGE.MATURE ? TILE_TYPE.CROP_GROWN : TILE_TYPE.CROP_PLANTED
                            };
                        }
                    }
                }
            }
            return newWorld;
        });
    }, [world, GROWTH_TIME_PER_STAGE, TILE_TYPE, CROP_STAGE]);

    const updateClouds = useCallback(() => {
        const lightFactor = getAmbientLightFactor(gameTime);
        setClouds(prevClouds => prevClouds.map(cloud => {
            let newX = cloud.x + cloud.speed;
            if (newX > WORLD_WIDTH_PIXELS) {
                newX = -cloud.width;
            }
            return { ...cloud, x: newX, opacity: 0.8 * lightFactor };
        }));
    }, [gameTime]);

    const updateSunMoonPositions = useCallback(() => {
        const groundStartRow = Math.floor(WORLD_HEIGHT_TILES * 0.75);
        const horizonY = groundStartRow * TILE_SIZE;
        const peakY = TILE_SIZE * 2;
        const amplitude = horizonY - peakY;

        const sunAngle = (gameTime / 24) * Math.PI * 2;
        const newSunX = (gameTime / 24) * WORLD_WIDTH_PIXELS;
        const newSunY = horizonY + amplitude * Math.sin(sunAngle - Math.PI / 2);

        const moonAngle = ((gameTime + 12) % 24 / 24) * Math.PI * 2;
        const newMoonX = ((gameTime + 12) % 24 / 24) * WORLD_WIDTH_PIXELS;
        const newMoonY = horizonY + amplitude * Math.sin(moonAngle - Math.PI / 2);

        setSunState(prev => ({ ...prev, x: newSunX, y: newSunY, visible: newSunY < horizonY + prev.radius / 2 }));
        setMoonState(prev => ({ ...prev, x: newMoonX, y: newMoonY, visible: newMoonY < horizonY + prev.radius / 2 }));
    }, [gameTime]);

    const generateFlyingObject = useCallback(() => {
        const now = Date.now();
        const FLYING_OBJECT_INTERVAL_MIN = 10000;
        const FLYING_OBJECT_INTERVAL_MAX = 30000;

        if (now - lastFlyingObjectTimeRef.current > (Math.random() * (FLYING_OBJECT_INTERVAL_MAX - FLYING_OBJECT_INTERVAL_MIN) + FLYING_OBJECT_INTERVAL_MIN)) {
            lastFlyingObjectTimeRef.current = now;
            const type = Math.random();
            const startX = Math.random() < 0.5 ? -TILE_SIZE * 5 : WORLD_WIDTH_PIXELS + TILE_SIZE * 5;
            const direction = startX < 0 ? 1 : -1;
            const baseSkyY = Math.random() * (WORLD_HEIGHT_PIXELS / 3);

            if (type < 0.5) {
                setBirds(prev => [...prev, {
                    x: startX, y: baseSkyY, speed: (Math.random() * 0.5 + 1) * direction,
                    width: TILE_SIZE * 1.5, height: TILE_SIZE * 0.8, wingState: 0, type: 'bird'
                }]);
            } else if (type < 0.8) {
                setPlanes(prev => [...prev, {
                    x: startX, y: baseSkyY + TILE_SIZE * 3, speed: (Math.random() * 0.8 + 2) * direction,
                    width: TILE_SIZE * 4, height: TILE_SIZE * 1.5, type: 'plane'
                }]);
            } else {
                setBalloons(prev => [...prev, {
                    x: startX, y: baseSkyY + TILE_SIZE * 6, speed: (Math.random() * 0.3 + 0.5) * direction,
                    width: TILE_SIZE * 2.5, height: TILE_SIZE * 3, type: 'balloon'
                }]);
            }
        }
    }, [TILE_SIZE, WORLD_WIDTH_PIXELS, WORLD_HEIGHT_PIXELS]);

    const updateFlyingObjects = useCallback(() => {
        setBirds(prev => prev.map((bird, i) => {
            let newBird = { ...bird, x: bird.x + bird.speed, wingState: (Math.floor(animationFrameId.current / 5) + i) % 2 };
            if ((newBird.speed > 0 && newBird.x > WORLD_WIDTH_PIXELS + newBird.width) ||
                (newBird.speed < 0 && newBird.x < -newBird.width)) {
                return null;
            }
            return newBird;
        }).filter(Boolean));

        setPlanes(prev => prev.map(plane => {
            let newPlane = { ...plane, x: plane.x + plane.speed };
            if ((newPlane.speed > 0 && newPlane.x > WORLD_WIDTH_PIXELS + newPlane.width) ||
                (newPlane.speed < 0 && newPlane.x < -plane.width)) {
                return null;
            }
            return newPlane;
        }).filter(Boolean));

        setBalloons(prev => prev.map((balloon, i) => {
            let newBalloon = { ...balloon, x: balloon.x + balloon.speed, y: balloon.y + Math.sin(animationFrameId.current * 0.05 + i) * 0.1 };
            if ((newBalloon.speed > 0 && newBalloon.x > WORLD_WIDTH_PIXELS + newBalloon.width) ||
                (newBalloon.speed < 0 && newBalloon.x < -newBalloon.width)) {
                return null;
            }
            return newBalloon;
        }).filter(Boolean));
    }, [WORLD_WIDTH_PIXELS]);

    const generateWorld = useCallback(() => {
        const newWorld = [];
        const groundStartRow = Math.floor(WORLD_HEIGHT_TILES * 0.75);

        for (let y = 0; y < WORLD_HEIGHT_TILES; y++) {
            const row = [];
            for (let x = 0; x < WORLD_WIDTH_TILES; x++) {
                let tileData = { type: TILE_TYPE.SKY, crop: null };
                if (y >= groundStartRow && y < groundStartRow + 3) {
                    tileData.type = TILE_TYPE.GRASS;
                } else if (y >= groundStartRow + 3) {
                    tileData.type = TILE_TYPE.DIRT;
                }
                row.push(tileData);
            }
            newWorld.push(row);
        }
        setWorld(newWorld);

        const groundLevelY = groundStartRow * TILE_SIZE;
        setTrees([
            { x: TILE_SIZE * 5, y: groundLevelY - TILE_SIZE * 5, width: TILE_SIZE * 2, height: TILE_SIZE * 5 },
            { x: TILE_SIZE * 15, y: groundLevelY - TILE_SIZE * 5, width: TILE_SIZE * 2, height: TILE_SIZE * 5 },
            { x: TILE_SIZE * 100, y: groundLevelY - TILE_SIZE * 6, width: TILE_SIZE * 2.5, height: TILE_SIZE * 6 },
            { x: TILE_SIZE * 110, y: groundLevelY - TILE_SIZE * 5, width: TILE_SIZE * 2, height: TILE_SIZE * 5 },
        ]);
        setBarns([
            { x: TILE_SIZE * 30, y: groundLevelY - TILE_SIZE * 7, width: TILE_SIZE * 8, height: TILE_SIZE * 7 },
            { x: TILE_SIZE * 130, y: groundLevelY - TILE_SIZE * 8, width: TILE_SIZE * 10, height: TILE_SIZE * 8 },
        ]);

        const newClouds = [];
        for (let i = 0; i < 5; i++) {
            newClouds.push({
                x: Math.random() * WORLD_WIDTH_PIXELS,
                y: Math.random() * (WORLD_HEIGHT_PIXELS / 3),
                width: TILE_SIZE * (5 + Math.random() * 5),
                height: TILE_SIZE * (2 + Math.random() * 2),
                speed: 0.2 + Math.random() * 0.3
            });
        }
        setClouds(newClouds);

        setPlayer(prev => ({ ...prev, x: WORLD_WIDTH_PIXELS / 4, y: groundLevelY - prev.height }));
        setTractor(prev => ({ ...prev, x: WORLD_WIDTH_PIXELS / 4 + 100, y: groundLevelY - prev.height }));
        setPlow(prev => ({ ...prev, x: WORLD_WIDTH_PIXELS / 4 + 100 - 100, y: groundLevelY - prev.height }));
        setSeeder(prev => ({ ...prev, x: WORLD_WIDTH_PIXELS / 4 + 100 + 100, y: groundLevelY - prev.height }));
        setCombineHarvester(prev => ({ ...prev, x: WORLD_WIDTH_PIXELS / 2 + 200, y: groundLevelY - prev.height }));
    }, [TILE_SIZE, WORLD_HEIGHT_TILES, WORLD_WIDTH_TILES, WORLD_WIDTH_PIXELS, WORLD_HEIGHT_PIXELS, TILE_TYPE]);

    const updateParticles = useCallback(() => {
        const now = Date.now();
        setParticles(prevParticles => {
            return prevParticles.map(p => {
                const elapsed = now - p.creationTime;
                if (elapsed > p.lifetime) {
                    return null;
                }
                p.vy += GRAVITY * 0.1;
                return {
                    ...p,
                    x: p.x + p.vx,
                    y: p.y + p.vy,
                    opacity: 1 - (elapsed / p.lifetime)
                };
            }).filter(Boolean);
        });
    }, []);

    // --- Game Loop ---
    const gameLoop = useCallback(() => {
        animationFrameId.current = requestAnimationFrame(gameLoop);

        setGameTime(prevTime => (prevTime + DAY_SPEED) % 24);

        if (tractor.isInVehicle) {
            handleTractorMovement();
        } else if (combineHarvester.isInVehicle) {
            handleCombineMovement();
        } else {
            handlePlayerMovement();
        }

        setPlayer(prev => updateEntityPosition(prev, world, WORLD_WIDTH_TILES));
        setTractor(prev => updateEntityPosition(prev, world, WORLD_WIDTH_TILES));
        setPlow(prev => updateEntityPosition(prev, world, WORLD_WIDTH_TILES));
        setSeeder(prev => updateEntityPosition(prev, world, WORLD_WIDTH_TILES));
        setCombineHarvester(prev => updateEntityPosition(prev, world, WORLD_WIDTH_TILES));

        if (tractor.isInVehicle && tractor.equipment) {
            let currentHitchedEntity = null;
            if (tractor.equipment.type === 'plow') currentHitchedEntity = plow;
            else if (tractor.equipment.type === 'seeder') currentHitchedEntity = seeder;

            if (currentHitchedEntity) {
                const newX = tractor.facing === 'right' ? tractor.x - currentHitchedEntity.width - 5 : tractor.x + tractor.width + 5;
                const newY = tractor.y + (tractor.height - currentHitchedEntity.height);

                if (currentHitchedEntity.type === 'plow') {
                    setPlow(prev => ({ ...prev, x: newX, y: newY, onGround: tractor.onGround, vy: tractor.vy }));
                } else if (currentHitchedEntity.type === 'seeder') {
                    setSeeder(prev => ({ ...prev, x: newX, y: newY, onGround: tractor.onGround, vy: tractor.vy }));
                }
            }
        }
        if (!plow.isHitched && !tractor.isInVehicle) setPlow(prev => updateEntityPosition(prev, world, WORLD_WIDTH_TILES));
        if (!seeder.isHitched && !tractor.isInVehicle) setSeeder(prev => updateEntityPosition(prev, world, WORLD_WIDTH_TILES));

        if (player.isInVehicle) {
            let currentVehicle = null;
            if (tractor.isInVehicle) currentVehicle = tractor;
            else if (combineHarvester.isInVehicle) currentVehicle = combineHarvester;

            if (currentVehicle) {
                setPlayer(prev => ({
                    ...prev,
                    x: currentVehicle.x + (currentVehicle.width / 2) - (prev.width / 2),
                    y: currentVehicle.y - prev.height
                }));
            }
        }

        applyPlowAction();
        applySeederAction();
        applyCombineAction();
        updateCropGrowth();
        updateClouds();
        updateSunMoonPositions();
        generateFlyingObject();
        updateFlyingObjects();
        updateParticles();
    }, [
        player, tractor, plow, seeder, combineHarvester, world,
        handlePlayerMovement, handleTractorMovement, handleCombineMovement,
        applyPlowAction, applySeederAction, applyCombineAction,
        updateCropGrowth, updateClouds, updateSunMoonPositions,
        generateFlyingObject, updateFlyingObjects, updateParticles, gameTime,
        WORLD_WIDTH_TILES, DAY_SPEED
    ]);

    // --- Effects ---
    useEffect(() => {
        generateWorld();
    }, [generateWorld]);

    useEffect(() => {
        let controlledEntity = player;
        if (tractor.isInVehicle) {
            controlledEntity = tractor;
        } else if (combineHarvester.isInVehicle) {
            controlledEntity = combineHarvester;
        }

        // Using a ref for canvas dimensions to avoid direct DOM access in render
        const canvasWidth = document.getElementById('game-canvas')?.width || 0;
        const canvasHeight = document.getElementById('game-canvas')?.height || 0;

        setCameraX(Math.max(0, Math.min(controlledEntity.x - canvasWidth / 2, WORLD_WIDTH_PIXELS - canvasWidth)));
        setCameraY(Math.max(0, Math.min(controlledEntity.y - canvasHeight / 2, WORLD_HEIGHT_PIXELS - canvasHeight)));

    }, [player, tractor, combineHarvester, WORLD_WIDTH_PIXELS, WORLD_HEIGHT_PIXELS]);

    useEffect(() => {
        animationFrameId.current = requestAnimationFrame(gameLoop);
        return () => cancelAnimationFrame(animationFrameId.current);
    }, [gameLoop]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: true }));
            if (e.key.toLowerCase() === 'e') {
                handleEnterExitVehicle();
            } else if (e.key.toLowerCase() === 'h') {
                handleHitchClosestAttachment();
            } else if (e.key.toLowerCase() === 'f') {
                handleTillSoil();
            } else if (e.key.toLowerCase() === 'g') {
                handlePlantCrop();
            } else if (e.key.toLowerCase() === 'j') {
                handleHarvestCrop();
            }
        };

        const handleKeyUp = (e) => {
            setKeys(prev => ({ ...prev, [e.key.toLowerCase()]: false }));
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleEnterExitVehicle, handleHitchClosestAttachment, handleTillSoil, handlePlantCrop, handleHarvestCrop]);

    // --- Shop and Vehicle Handlers (exposed via context) ---
    const handleBuySeeds = useCallback((seedType, quantity) => {
        setPlayer(prev => {
            const seedCost = SEED_PRICES[seedType] * quantity;
            if (prev.money >= seedCost) {
                showStatus(`Bought ${quantity} ${seedType.replace('Seeds', '')} seeds for $${seedCost}!`, 1500);
                triggerMoneyChange(-seedCost);
                return {
                    ...prev,
                    money: prev.money - seedCost,
                    inventory: {
                        ...prev.inventory,
                        [seedType]: prev.inventory[seedType] + quantity
                    }
                };
            } else {
                showStatus("Not enough money to buy seeds!", 1500);
                return prev;
            }
        });
    }, [showStatus, triggerMoneyChange]);

    const handleRefuel = useCallback(() => {
        setTractor(prev => (prev.isInVehicle ? { ...prev, fuel: prev.maxFuel } : prev));
        setCombineHarvester(prev => (prev.isInVehicle ? { ...prev, fuel: prev.maxFuel } : prev));

        let currentVehicleType = "No vehicle active";
        if (tractor.isInVehicle) currentVehicleType = tractor.type;
        else if (combineHarvester.isInVehicle) currentVehicleType = combineHarvester.type;

        if (currentVehicleType !== "No vehicle active") {
            showStatus(`${currentVehicleType.charAt(0).toUpperCase() + currentVehicleType.slice(1)} refueled!`, 1500);
        } else {
            showStatus("No vehicle active to refuel!", 1000);
        }
    }, [tractor.isInVehicle, combineHarvester.isInVehicle, showStatus]);

    const handleSellCrops = useCallback((cropTypeToSell = null) => {
        setPlayer(prev => {
            let totalSoldValue = 0;
            const newInventory = { ...prev.inventory };

            if (cropTypeToSell) {
                const amount = newInventory[cropTypeToSell] || 0;
                if (amount > 0) {
                    totalSoldValue += amount * CROP_PRICES[cropTypeToSell];
                    newInventory[cropTypeToSell] = 0;
                    showStatus(`Sold all ${cropTypeToSell} for $${totalSoldValue}!`, 1500);
                } else {
                    showStatus(`No ${cropTypeToSell} to sell!`, 1000);
                }
            } else {
                for (const cropType in CROP_PRICES) {
                    const amount = newInventory[cropType] || 0;
                    if (amount > 0) {
                        totalSoldValue += amount * CROP_PRICES[cropType];
                        newInventory[cropType] = 0;
                    }
                }
                if (totalSoldValue > 0) {
                    showStatus(`Sold all crops for $${totalSoldValue}!`, 1500);
                } else {
                    showStatus("No crops to sell!", 1000);
                }
            }

            if (totalSoldValue > 0) {
                triggerMoneyChange(totalSoldValue);
            }

            return {
                ...prev,
                money: prev.money + totalSoldValue,
                inventory: newInventory
            };
        });
    }, [showStatus, triggerMoneyChange]);

    const handleBuildSilo = useCallback(() => {
        setPlayer(prev => {
            if (prev.siloBuilt) {
                showStatus("Silo already built!", 1500);
                return prev;
            }
            const cost = STRUCTURE_PRICES.silo;
            if (prev.money >= cost) {
                showStatus("Silo built! Max storage increased!", 1500);
                triggerMoneyChange(-cost);
                setSilos(currentSilos => [...currentSilos, {
                    x: WORLD_WIDTH_PIXELS / 2 - TILE_SIZE * 5,
                    y: TILE_SIZE * 15 - TILE_SIZE * 8,
                    width: TILE_SIZE * 5,
                    height: TILE_SIZE * 8
                }]);
                return {
                    ...prev,
                    money: prev.money - cost,
                    maxStorage: prev.maxStorage + 200,
                    siloBuilt: true,
                };
            } else {
                showStatus("Not enough money to build silo!", 1500);
                return prev;
            }
        });
    }, [showStatus, triggerMoneyChange]);

    const handleUpgradeVehicle = useCallback((vehicleType) => {
        if (vehicleType === 'tractor') {
            setTractor(prev => {
                const nextLevel = prev.upgradeLevel + 1;
                if (nextLevel >= VEHICLE_UPGRADE_TIERS.tractor.length) {
                    showStatus("Tractor is already max level!", 1500);
                    return prev;
                }
                const upgradeInfo = VEHICLE_UPGRADE_TIERS.tractor[nextLevel];
                if (player.money >= upgradeInfo.cost) {
                    showStatus(`Tractor upgraded to level ${nextLevel}!`, 1500);
                    triggerMoneyChange(-upgradeInfo.cost);
                    return {
                        ...prev,
                        speed: upgradeInfo.speed,
                        maxFuel: upgradeInfo.maxFuel,
                        fuel: upgradeInfo.maxFuel,
                        upgradeLevel: nextLevel,
                    };
                } else {
                    showStatus("Not enough money to upgrade tractor!", 1500);
                    return prev;
                }
            });
        } else if (vehicleType === 'combineHarvester') {
            setCombineHarvester(prev => {
                const nextLevel = prev.upgradeLevel + 1;
                if (nextLevel >= VEHICLE_UPGRADE_TIERS.combineHarvester.length) {
                    showStatus("Combine Harvester is already max level!", 1500);
                    return prev;
                }
                const upgradeInfo = VEHICLE_UPGRADE_TIERS.combineHarvester[nextLevel];
                if (player.money >= upgradeInfo.cost) {
                    showStatus(`Combine Harvester upgraded to level ${nextLevel}!`, 1500);
                    triggerMoneyChange(-upgradeInfo.cost);
                    return {
                        ...prev,
                        speed: upgradeInfo.speed,
                        maxFuel: upgradeInfo.maxFuel,
                        fuel: upgradeInfo.maxFuel,
                        upgradeLevel: nextLevel,
                    };
                } else {
                    showStatus("Not enough money to upgrade Combine Harvester!", 1500);
                    return prev;
                }
            });
        }
    }, [player.money, showStatus, triggerMoneyChange]);


    const contextValue = {
        // Game State
        player, setPlayer,
        tractor, setTractor,
        plow, setPlow,
        seeder, setSeeder,
        combineHarvester, setCombineHarvester,
        world, setWorld,
        trees, setTrees,
        barns, setBarns,
        silos, setSilos,
        clouds, setClouds,
        birds, setBirds,
        planes, setPlanes,
        balloons, setBalloons,
        particles, setParticles,
        gameTime, setGameTime,
        cameraX, setCameraX,
        cameraY, setCameraY,
        keys, setKeys,
        statusMessage, setStatusMessage,
        statusVisible, setStatusVisible,
        selectedCropType, setSelectedCropType,
        isShopOpen, setIsShopOpen,
        isSettingsOpen, setIsSettingsOpen,
        moneyChangeAmount, setMoneyChangeAmount,
        moneyChangeVisible, setMoneyChangeVisible,
        moneyChangePosition, setMoneyChangePosition,
        sunState, setSunState,
        moonState, setMoonState,
        tractorImageRef, tractorImageLoaded,

        // Game Logic Handlers
        handlePlayerMovement,
        handleTractorMovement,
        handleCombineMovement,
        handleEnterExitVehicle,
        handleHitchClosestAttachment,
        handleTillSoil,
        handlePlantCrop,
        handleHarvestCrop,
        applyPlowAction,
        applySeederAction,
        applyCombineAction,
        updateCropGrowth,
        updateClouds,
        updateSunMoonPositions,
        generateFlyingObject,
        updateFlyingObjects,
        updateParticles,
        generateWorld,

        // UI & Shop Handlers
        showStatus,
        triggerMoneyChange,
        createParticles,
        handleBuySeeds,
        handleRefuel,
        handleSellCrops,
        handleBuildSilo,
        handleUpgradeVehicle,

        // Firebase
        saveGame,
        loadGame,
        isAuthReady,
        userId,

        // Constants & Utils
        TILE_SIZE, GRAVITY, WORLD_WIDTH_TILES, WORLD_HEIGHT_TILES, WORLD_WIDTH_PIXELS, WORLD_HEIGHT_PIXELS,
        CROP_TYPE, TILE_COLORS, CROP_PRICES, SEED_PRICES, STRUCTURE_PRICES, VEHICLE_UPGRADE_TIERS,
        DEEP_NIGHT_SKY_COLOR, DAWN_SKY_COLOR, SUNRISE_TINT_COLOR, MORNING_SKY_COLOR, AFTERNOON_SKY_COLOR,
        SUNSET_TINT_COLOR, DUSK_SKY_COLOR,
        getSkyColor, getAmbientLightFactor, lerpColor, applyLightFactorToColor,
    };

    return (
        <GameContext.Provider value={contextValue}>
            {children}
        </GameContext.Provider>
    );
};

export const useGame = () => useContext(GameContext);


// --- Game Canvas Component (previously in components/GameCanvas.js) ---
const GameCanvas = () => {
    const canvasRef = useRef(null);
    const minimapCanvasRef = useRef(null);
    const {
        world, trees, barns, silos, clouds, birds, planes, balloons, particles,
        player, tractor, plow, seeder, combineHarvester,
        gameTime, cameraX, cameraY, tractorImageRef, tractorImageLoaded,
        sunState, moonState,
    } = useGame();

    // Combine all sky colors into one object for getSkyColor utility
    const skyColors = {
        DEEP_NIGHT_SKY_COLOR, DAWN_SKY_COLOR, SUNRISE_TINT_COLOR, MORNING_SKY_COLOR,
        AFTERNOON_SKY_COLOR, SUNSET_TINT_COLOR, DUSK_SKY_COLOR
    };

    const drawGame = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const minimapCanvas = minimapCanvasRef.current;
        const minimapCtx = minimapCanvas.getContext('2d');

        if (world.length === 0) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Sky Background
        ctx.fillStyle = getSkyColor(gameTime, skyColors);
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Draw Sun and Moon
        const ambientLightFactor = getAmbientLightFactor(gameTime);
        const drawSun = (sunObj) => {
            if (!sunObj.visible) return;
            ctx.fillStyle = sunObj.color;
            ctx.beginPath();
            ctx.arc(sunObj.x - cameraX, sunObj.y - cameraY, sunObj.radius, 0, Math.PI * 2);
            ctx.fill();
        };
        const drawMoon = (moonObj) => {
            if (!moonObj.visible) return;
            ctx.fillStyle = moonObj.color;
            ctx.beginPath();
            ctx.arc(moonObj.x - cameraX, moonObj.y - cameraY, moonObj.radius, 0, Math.PI * 2);
            ctx.fill();
        };
        drawSun(sunState);
        drawMoon(moonState);

        // 3. Draw Clouds
        for (const cloud of clouds) {
            ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
            ctx.fillRect(cloud.x - cameraX, cloud.y - cameraY, cloud.width, cloud.height);
        }

        // 4. Draw Flying Objects
        const drawBird = (bird) => {
            const birdColor = applyLightFactorToColor('#333333', ambientLightFactor);
            const wingColor = applyLightFactorToColor('#555555', ambientLightFactor);

            ctx.save();
            ctx.translate(bird.x - cameraX, bird.y - cameraY);
            if (bird.speed < 0) { ctx.scale(-1, 1); ctx.translate(-bird.width, 0); }
            ctx.fillStyle = birdColor;
            ctx.fillRect(0, 0, bird.width * 0.4, bird.height * 0.5);
            ctx.fillRect(bird.width * 0.3, bird.height * 0.2, bird.width * 0.2, bird.height * 0.3);
            ctx.fillStyle = wingColor;
            const currentFrame = Math.floor(performance.now() / 100) % 2; // Simple time-based animation
            if (bird.wingState === 0) { ctx.fillRect(0, -bird.height * 0.3, bird.width, bird.height * 0.3); }
            else { ctx.fillRect(0, bird.height * 0.5, bird.width, bird.height * 0.3); }
            ctx.restore();
        };
        const drawPlane = (plane) => {
            const bodyColor = applyLightFactorToColor('#A9A9A9', ambientLightFactor);
            const wingColor = applyLightFactorToColor('#808080', ambientLightFactor);
            const tailColor = applyLightFactorToColor('#696969', ambientLightFactor);

            ctx.save();
            ctx.translate(plane.x - cameraX, plane.y - cameraY);
            if (plane.speed < 0) { ctx.scale(-1, 1); ctx.translate(-plane.width, 0); }
            ctx.fillStyle = bodyColor;
            ctx.fillRect(0, plane.height * 0.3, plane.width, plane.height * 0.4);
            ctx.fillStyle = wingColor;
            ctx.fillRect(plane.width * 0.2, 0, plane.width * 0.6, plane.height * 0.3);
            ctx.fillRect(plane.width * 0.2, plane.height * 0.7, plane.width * 0.6, plane.height * 0.3);
            ctx.fillStyle = tailColor;
            ctx.fillRect(plane.width * 0.9, plane.height * 0.1, plane.width * 0.1, plane.height * 0.6);
            ctx.restore();
        };
        const drawBalloon = (balloon) => {
            const balloonColor = applyLightFactorToColor('#FF6347', ambientLightFactor);
            const basketColor = applyLightFactorToColor('#8B4513', ambientLightFactor);
            const ropeColor = applyLightFactorToColor('#444444', ambientLightFactor);

            ctx.save();
            ctx.translate(balloon.x - cameraX, balloon.y - cameraY);
            if (balloon.speed < 0) { ctx.scale(-1, 1); ctx.translate(-balloon.width, 0); }
            ctx.fillStyle = balloonColor;
            ctx.beginPath();
            ctx.ellipse(balloon.width / 2, balloon.height * 0.4, balloon.width / 2, balloon.height * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = basketColor;
            ctx.fillRect(balloon.width * 0.3, balloon.height * 0.8, balloon.width * 0.4, balloon.height * 0.2);
            ctx.fillStyle = ropeColor;
            ctx.fillRect(balloon.width * 0.35, balloon.height * 0.7, TILE_SIZE * 0.05, TILE_SIZE * 0.3);
            ctx.fillRect(balloon.width * 0.6, balloon.height * 0.7, TILE_SIZE * 0.05, TILE_SIZE * 0.3);
            ctx.restore();
        };

        for (const bird of birds) { drawBird(bird); }
        for (const plane of planes) { drawPlane(plane); }
        for (const balloon of balloons) { drawBalloon(balloon); }

        // 5. Draw Ground Tiles and Crops
        const startTileX = Math.floor(cameraX / TILE_SIZE);
        const endTileX = Math.ceil((cameraX + canvas.width) / TILE_SIZE);
        const startTileY = Math.floor(cameraY / TILE_SIZE);
        const endTileY = Math.ceil((cameraY + canvas.height) / TILE_SIZE);

        for (let y = startTileY; y < endTileY; y++) {
            for (let x = startTileX; x < endTileX; x++) {
                if (x >= 0 && x < WORLD_WIDTH_TILES && y >= 0 && y < WORLD_HEIGHT_TILES) {
                    const tile = world[y][x];
                    const drawX = x * TILE_SIZE - cameraX;
                    const drawY = y * TILE_SIZE - cameraY;

                    if (tile.type === TILE_TYPE.SKY) {
                        continue;
                    } else if (tile.type === TILE_TYPE.GRASS) {
                        ctx.fillStyle = applyLightFactorToColor(TILE_COLORS[TILE_TYPE.DIRT], ambientLightFactor);
                        ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
                        ctx.fillStyle = applyLightFactorToColor(TILE_COLORS[TILE_TYPE.GRASS], ambientLightFactor);
                        ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE / 2); // Grass top layer
                    } else if (tile.type === TILE_TYPE.CROP_PLANTED || tile.type === TILE_TYPE.CROP_GROWN) {
                        ctx.fillStyle = applyLightFactorToColor(TILE_COLORS[TILE_TYPE.TILLED], ambientLightFactor);
                        ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);

                        if (tile.crop) {
                            const cropColor = TILE_COLORS[tile.crop.type][tile.crop.stage];
                            ctx.fillStyle = applyLightFactorToColor(cropColor, ambientLightFactor);
                            if (tile.crop.stage === CROP_STAGE.SEED) {
                                ctx.fillRect(drawX + TILE_SIZE * 0.4, drawY + TILE_SIZE * 0.7, TILE_SIZE * 0.2, TILE_SIZE * 0.2);
                            } else if (tile.crop.stage === CROP_STAGE.YOUNG) {
                                ctx.fillRect(drawX + TILE_SIZE * 0.3, drawY + TILE_SIZE * 0.5, TILE_SIZE * 0.4, TILE_SIZE * 0.5);
                            } else if (tile.crop.stage === CROP_STAGE.MATURE) {
                                if (tile.crop.type === 'wheat') {
                                    ctx.fillRect(drawX + TILE_SIZE * 0.2, drawY + TILE_SIZE * 0.2, TILE_SIZE * 0.6, TILE_SIZE * 0.8);
                                } else if (tile.crop.type === 'corn') {
                                    ctx.fillRect(drawX + TILE_SIZE * 0.45, drawY + TILE_SIZE * 0.2, TILE_SIZE * 0.1, TILE_SIZE * 0.8);
                                    ctx.fillStyle = applyLightFactorToColor(TILE_COLORS.corn[CROP_STAGE.MATURE], ambientLightFactor);
                                    ctx.fillRect(drawX + TILE_SIZE * 0.3, drawY + TILE_SIZE * 0.4, TILE_SIZE * 0.4, TILE_SIZE * 0.3);
                                } else if (tile.crop.type === 'potato') {
                                    ctx.fillRect(drawX + TILE_SIZE * 0.3, drawY + TILE_SIZE * 0.3, TILE_SIZE * 0.4, TILE_SIZE * 0.4);
                                    ctx.fillStyle = applyLightFactorToColor(TILE_COLORS.potato[CROP_STAGE.MATURE], ambientLightFactor);
                                    ctx.beginPath();
                                    ctx.arc(drawX + TILE_SIZE * 0.3, drawY + TILE_SIZE * 0.9, TILE_SIZE * 0.15, 0, Math.PI * 2);
                                    ctx.arc(drawX + TILE_SIZE * 0.7, drawY + TILE_SIZE * 0.9, TILE_SIZE * 0.15, 0, Math.PI * 2);
                                    ctx.fill();
                                }
                            }
                        }
                    } else {
                        ctx.fillStyle = applyLightFactorToColor(TILE_COLORS[tile.type], ambientLightFactor);
                        ctx.fillRect(drawX, drawY, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }

        // 6. Draw static objects (trees, barns, silos) BEFORE vehicles and player
        const drawTree = (tree) => {
            const trunkColor = applyLightFactorToColor('#8B4513', ambientLightFactor);
            const darkTrunkColor = applyLightFactorToColor('#5C4033', ambientLightFactor);
            const leafColor1 = applyLightFactorToColor('#228B22', ambientLightFactor);
            const leafColor2 = applyLightFactorToColor('#3CB371', ambientLightFactor);

            ctx.fillStyle = trunkColor;
            ctx.fillRect(tree.x - cameraX + tree.width * 0.4, tree.y - cameraY + tree.height * 0.6, tree.width * 0.2, tree.height * 0.4);
            ctx.fillStyle = darkTrunkColor;
            ctx.fillRect(tree.x - cameraX + tree.width * 0.4, tree.y - cameraY + tree.height * 0.6, tree.width * 0.05, tree.height * 0.4);

            ctx.fillStyle = leafColor1;
            ctx.beginPath();
            ctx.arc(tree.x - cameraX + tree.width / 2, tree.y - cameraY + tree.height * 0.5, tree.width * 0.4, 0, Math.PI * 2);
            ctx.arc(tree.x - cameraX + tree.width * 0.3, tree.y - cameraY + tree.height * 0.3, tree.width * 0.3, 0, Math.PI * 2);
            ctx.arc(tree.x - cameraX + tree.width * 0.7, tree.y - cameraY + tree.height * 0.3, tree.width * 0.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = leafColor2;
            ctx.beginPath();
            ctx.arc(tree.x - cameraX + tree.width * 0.55, tree.y - cameraY + tree.height * 0.45, tree.width * 0.35, 0, Math.PI * 2);
            ctx.fill();
        };
        const drawBarn = (barn) => {
            const wallColor = applyLightFactorToColor('#A52A2A', ambientLightFactor);
            const darkWallColor = applyLightFactorToColor('#8B0000', ambientLightFactor);
            const roofColor = applyLightFactorToColor('#8B0000', ambientLightFactor);
            const darkRoofColor = applyLightFactorToColor('#6A0000', ambientLightFactor);
            const doorColor = applyLightFactorToColor('#5C4033', ambientLightFactor);
            const windowColor = applyLightFactorToColor('#ADD8E6', ambientLightFactor);

            ctx.fillStyle = wallColor;
            ctx.fillRect(barn.x - cameraX, barn.y - cameraY + barn.height * 0.3, barn.width, barn.height * 0.7);
            ctx.fillStyle = darkWallColor;
            ctx.fillRect(barn.x - cameraX + barn.width * 0.9, barn.y - cameraY + barn.height * 0.3, barn.width * 0.1, barn.height * 0.7);

            ctx.fillStyle = roofColor;
            ctx.beginPath();
            ctx.moveTo(barn.x - cameraX - barn.width * 0.1, barn.y - cameraY + barn.height * 0.3);
            ctx.lineTo(barn.x - cameraX + barn.width * 0.5, barn.y - cameraY);
            ctx.lineTo(barn.x - cameraX + barn.width * 1.1, barn.y - cameraY + barn.height * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = darkRoofColor;
            ctx.beginPath();
            ctx.moveTo(barn.x - cameraX + barn.width * 0.5, barn.y - cameraY);
            ctx.lineTo(barn.x - cameraX + barn.width * 1.1, barn.y - cameraY + barn.height * 0.3);
            ctx.lineTo(barn.x - cameraX + barn.width * 0.9, barn.y - cameraY + barn.height * 0.3);
            ctx.lineTo(barn.x - cameraX + barn.width * 0.5, barn.y - cameraY + barn.height * 0.05);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = doorColor;
            ctx.fillRect(barn.x - cameraX + barn.width * 0.4, barn.y - cameraY + barn.height * 0.6, barn.width * 0.2, barn.height * 0.4);
            ctx.fillStyle = applyLightFactorToColor('#4A3020', ambientLightFactor);
            ctx.fillRect(barn.x - cameraX + barn.width * 0.42, barn.y - cameraY + barn.height * 0.62, barn.width * 0.03, barn.height * 0.36);
            ctx.fillRect(barn.x - cameraX + barn.width * 0.55, barn.y - cameraY + barn.height * 0.62, barn.width * 0.03, barn.height * 0.36);

            ctx.fillStyle = windowColor;
            ctx.fillRect(barn.x - cameraX + barn.width * 0.15, barn.y - cameraY + barn.height * 0.4, barn.width * 0.15, barn.height * 0.15);
            ctx.fillStyle = applyLightFactorToColor('#000000', ambientLightFactor);
            ctx.fillRect(barn.x - cameraX + barn.width * 0.15, barn.y - cameraY + barn.height * 0.47, barn.width * 0.15, barn.height * 0.01);
            ctx.fillRect(barn.x - cameraX + barn.width * 0.22, barn.y - cameraY + barn.height * 0.4, barn.width * 0.01, barn.height * 0.15);
        };

        const drawSilo = (silo) => {
            const siloColor = applyLightFactorToColor('#B0C4DE', ambientLightFactor); // Light steel blue
            const roofColor = applyLightFactorToColor('#696969', ambientLightFactor); // Dark grey for roof
            const baseColor = applyLightFactorToColor('#8B4513', ambientLightFactor); // Brown for base

            // Base
            ctx.fillStyle = baseColor;
            ctx.fillRect(silo.x - cameraX, silo.y - cameraY + silo.height * 0.9, silo.width, silo.height * 0.1);

            // Main body
            ctx.fillStyle = siloColor;
            ctx.fillRect(silo.x - cameraX + silo.width * 0.1, silo.y - cameraY + silo.height * 0.1, silo.width * 0.8, silo.height * 0.8);

            // Roof (cone shape)
            ctx.fillStyle = roofColor;
            ctx.beginPath();
            ctx.moveTo(silo.x - cameraX + silo.width * 0.1, silo.y - cameraY + silo.height * 0.1);
            ctx.lineTo(silo.x - cameraX + silo.width * 0.5, silo.y - cameraY);
            ctx.lineTo(silo.x - cameraX + silo.width * 0.9, silo.y - cameraY + silo.height * 0.1);
            ctx.closePath();
            ctx.fill();

            // Door/opening
            ctx.fillStyle = applyLightFactorToColor('#556B2F', ambientLightFactor); // Darker green
            ctx.fillRect(silo.x - cameraX + silo.width * 0.4, silo.y - cameraY + silo.height * 0.7, silo.width * 0.2, silo.height * 0.2);
        };


        for (const tree of trees) { drawTree(tree); }
        for (const barn of barns) { drawBarn(barn); }
        for (const silo of silos) { drawSilo(silo); } // Draw silos

        // 7. Draw unhitched attachments (plow, seeder)
        const drawPlow = (p) => {
            const frameColor = applyLightFactorToColor('#8B4513', ambientLightFactor);
            const bladeColor = applyLightFactorToColor('#696969', ambientLightFactor);

            ctx.fillStyle = frameColor;
            ctx.fillRect(p.x - cameraX, p.y - cameraY + p.height * 0.5, p.width, p.height * 0.2);

            ctx.fillStyle = bladeColor;
            if (tractor.facing === 'right') {
                ctx.beginPath();
                ctx.moveTo(p.x - cameraX + p.width * 0.1, p.y - cameraY + p.height * 0.7);
                ctx.lineTo(p.x - cameraX + p.width * 0.3, p.y - cameraY + p.height);
                ctx.lineTo(p.x - cameraX + p.width * 0.3, p.y - cameraY + p.height * 0.7);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(p.x - cameraX + p.width * 0.4, p.y - cameraY + p.height * 0.7);
                ctx.lineTo(p.x - cameraX + p.width * 0.6, p.y - cameraY + p.height);
                ctx.lineTo(p.x - cameraX + p.width * 0.6, p.y - cameraY + p.height * 0.7);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(p.x - cameraX + p.width * 0.7, p.y - cameraY + p.height * 0.7);
                ctx.lineTo(p.x - cameraX + p.width * 0.9, p.y - cameraY + p.height);
                ctx.lineTo(p.x - cameraX + p.width * 0.9, p.y - cameraY + p.height * 0.7);
                ctx.closePath();
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.moveTo(p.x - cameraX + p.width * 0.9, p.y - cameraY + p.height * 0.7);
                ctx.lineTo(p.x - cameraX + p.width * 0.7, p.y - cameraY + p.height);
                ctx.lineTo(p.x - cameraX + p.width * 0.7, p.y - cameraY + p.height * 0.7);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(p.x - cameraX + p.width * 0.6, p.y - cameraY + p.height * 0.7);
                ctx.lineTo(p.x - cameraX + p.width * 0.4, p.y - cameraY + p.height);
                ctx.lineTo(p.x - cameraX + p.width * 0.4, p.y - cameraY + p.height * 0.7);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(p.x - cameraX + p.width * 0.3, p.y - cameraY + p.height * 0.7);
                ctx.lineTo(p.x - cameraX + p.width * 0.1, p.y - cameraY + p.height);
                ctx.lineTo(p.x - cameraX + p.width * 0.1, p.y - cameraY + p.height * 0.7);
                ctx.closePath();
                ctx.fill();
            }
        };
        const drawSeeder = (s) => {
            const bodyColor = applyLightFactorToColor('#696969', ambientLightFactor);
            const hopperColor = applyLightFactorToColor('#808080', ambientLightFactor);
            const lightGreen = applyLightFactorToColor('#556B2F', ambientLightFactor);

            ctx.fillStyle = bodyColor;
            ctx.fillRect(s.x - cameraX, s.y - cameraY + s.height * 0.3, s.width, s.height * 0.4);
            ctx.fillStyle = hopperColor;
            ctx.fillRect(s.x - cameraX + s.width * 0.1, s.y - cameraY, s.width * 0.8, s.height * 0.4);
            ctx.fillStyle = applyLightFactorToColor('#909090', ambientLightFactor);
            ctx.fillRect(s.x - cameraX + s.width * 0.1, s.y - cameraY, s.width * 0.8, s.height * 0.05);

            ctx.fillStyle = lightGreen;
            ctx.fillRect(s.x - cameraX + s.width * 0.15, s.y - cameraY + s.height * 0.7, TILE_SIZE * 0.2, TILE_SIZE * 0.4);
            ctx.fillRect(s.x - cameraX + s.width * 0.4, s.y - cameraY + s.height * 0.7, TILE_SIZE * 0.2, TILE_SIZE * 0.4);
            ctx.fillRect(s.x - cameraX + s.width * 0.65, s.y - cameraY + s.height * 0.7, TILE_SIZE * 0.2, TILE_SIZE * 0.4);

            ctx.fillStyle = applyLightFactorToColor('#444444', ambientLightFactor);
            ctx.beginPath();
            ctx.arc(s.x - cameraX + s.width * 0.2, s.y - cameraY + s.height * 0.7, TILE_SIZE * 0.4, 0, Math.PI * 2);
            ctx.arc(s.x - cameraX + s.width * 0.8, s.y - cameraY + s.height * 0.7, TILE_SIZE * 0.4, 0, Math.PI * 2);
            ctx.fill();
        };

        if (!plow.isHitched) drawPlow(plow);
        if (!seeder.isHitched) drawSeeder(seeder);

        // 8. Draw vehicles (tractor and combine)
        const drawTractor = (tr) => {
            if (!tractorImageLoaded) {
                const bodyColor = applyLightFactorToColor('#A52A2A', ambientLightFactor);
                const darkBodyColor = applyLightFactorToColor('#8B0000', ambientLightFactor);
                const windowFrameColor = applyLightFactorToColor('#5C4033', ambientLightFactor);
                const windowColor = applyLightFactorToColor('#ADD8E6', ambientLightFactor);
                const wheelColor = applyLightFactorToColor('#222222', ambientLightFactor);
                const rimColor = applyLightFactorToColor('#FFA500', ambientLightFactor);
                const exhaustColor = applyLightFactorToColor('#696969', ambientLightFactor);
                const lightColor = applyLightFactorToColor('#FFD700', ambientLightFactor);

                ctx.save();
                ctx.translate(tr.x - cameraX, tr.y - cameraY);
                if (tr.facing === 'left') {
                    ctx.translate(tr.width / 2, 0);
                    ctx.scale(-1, 1);
                    ctx.translate(-tr.width / 2, 0);
                }
                ctx.fillStyle = bodyColor;
                ctx.fillRect(0, tr.height * 0.2, tr.width, tr.height * 0.6);
                ctx.fillStyle = darkBodyColor;
                ctx.fillRect(0, tr.height * 0.7, tr.width, tr.height * 0.1);
                ctx.fillRect(tr.width * 0.7, tr.height * 0.2, tr.width * 0.3, tr.height * 0.6);
                ctx.fillStyle = applyLightFactorToColor('#333333', ambientLightFactor);
                ctx.fillRect(tr.width * 0.95, tr.height * 0.3, tr.width * 0.05, tr.height * 0.4);
                ctx.fillStyle = lightColor;
                ctx.fillRect(tr.width * 0.8, tr.height * 0.35, TILE_SIZE * 0.2, TILE_SIZE * 0.2);
                ctx.fillRect(tr.width * 0.8, tr.height * 0.55, TILE_SIZE * 0.2, TILE_SIZE * 0.2);
                ctx.fillStyle = windowFrameColor;
                ctx.fillRect(0, -tr.height * 0.4, tr.width * 0.4, tr.height * 0.6);
                ctx.fillStyle = windowColor;
                ctx.fillRect(tr.width * 0.05, -tr.height * 0.3, tr.width * 0.3, tr.height * 0.3);
                ctx.fillRect(0, -tr.height * 0.2, tr.width * 0.05, tr.height * 0.3);
                ctx.fillRect(tr.width * 0.35, -tr.height * 0.2, tr.width * 0.05, tr.height * 0.3);
                ctx.fillStyle = wheelColor;
                ctx.fillRect(tr.width * 0.05, tr.height * 0.6, TILE_SIZE * 1.5, TILE_SIZE * 1.5);
                ctx.fillRect(tr.width * 0.7, tr.height * 0.6, TILE_SIZE * 1.2, TILE_SIZE * 1.2);
                ctx.fillStyle = rimColor;
                ctx.fillRect(tr.width * 0.05 + TILE_SIZE * 0.4, tr.height * 0.6 + TILE_SIZE * 0.4, TILE_SIZE * 0.7, TILE_SIZE * 0.7);
                ctx.fillRect(tr.width * 0.7 + TILE_SIZE * 0.3, tr.height * 0.6 + TILE_SIZE * 0.3, TILE_SIZE * 0.6, TILE_SIZE * 0.6);
                ctx.fillStyle = exhaustColor;
                ctx.fillRect(tr.width * 0.4, -tr.height * 0.6, TILE_SIZE * 0.2, TILE_SIZE * 1);
                ctx.fillRect(tr.width * 0.4, -tr.height * 0.7, TILE_SIZE * 0.2, TILE_SIZE * 0.1);
                ctx.restore();
            } else {
                ctx.save();
                ctx.translate(tr.x - cameraX, tr.y - cameraY);
                if (tr.facing === 'right') {
                    ctx.translate(tr.width, 0);
                    ctx.scale(-1, 1);
                }
                ctx.globalAlpha = ambientLightFactor;
                ctx.drawImage(tractorImageRef.current, 0, 0, tr.width, tr.height);
                ctx.restore();
            }
        };

        const drawCombineHarvester = (c) => {
            const bodyColor = applyLightFactorToColor('#FFD700', ambientLightFactor);
            const darkBodyColor = applyLightFactorToColor('#DAA520', ambientLightFactor);
            const cabinColor = applyLightFactorToColor('#B8860B', ambientLightFactor);
            const windowColor = applyLightFactorToColor('#87CEEB', ambientLightFactor);
            const wheelColor = applyLightFactorToColor('#222222', ambientLightFactor);
            const headerColor = applyLightFactorToColor('#8B4513', ambientLightFactor);
            const reelColor = applyLightFactorToColor('#696969', ambientLightFactor);
            const bladeColor = applyLightFactorToColor('#AAAAAA', ambientLightFactor);

            ctx.save();
            ctx.translate(c.x - cameraX, c.y - cameraY);

            if (c.facing === 'left') {
                ctx.translate(c.width / 2, 0);
                ctx.scale(-1, 1);
                ctx.translate(-c.width / 2, 0);
            }

            ctx.fillStyle = bodyColor;
            ctx.fillRect(0, 0, c.width, c.height * 0.7);
            ctx.fillStyle = darkBodyColor;
            ctx.fillRect(c.width * 0.7, c.height * 0.1, c.width * 0.3, c.height * 0.6);

            ctx.fillStyle = cabinColor;
            ctx.fillRect(0, -c.height * 0.3, c.width * 0.4, c.height * 0.4);
            ctx.fillStyle = windowColor;
            ctx.fillRect(c.width * 0.05, -c.height * 0.2, c.width * 0.3, c.height * 0.25);

            ctx.fillStyle = wheelColor;
            ctx.beginPath();
            ctx.arc(c.width * 0.2, c.height * 0.7, TILE_SIZE * 1, 0, Math.PI * 2);
            ctx.arc(c.width * 0.8, c.height * 0.7, TILE_SIZE * 1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = applyLightFactorToColor('#444444', ambientLightFactor);
            ctx.beginPath();
            ctx.arc(c.width * 0.2, c.height * 0.7, TILE_SIZE * 0.4, 0, Math.PI * 2);
            ctx.arc(c.width * 0.8, c.height * 0.7, TILE_SIZE * 0.4, 0, Math.PI * 2);
            ctx.fill();

            const headerWidth = TILE_SIZE * 2;
            const headerHeight = c.height * 0.3;
            const headerYOffset = c.height * 0.4;
            const headerXLocal = c.width;

            ctx.fillStyle = headerColor;
            ctx.fillRect(headerXLocal, headerYOffset, headerWidth, headerHeight);

            const reelXLocal = headerXLocal + headerWidth * 0.25;
            ctx.fillStyle = reelColor;
            if (c.isInVehicle && c.vx !== 0) {
                const animationState = Math.floor(performance.now() / 100) % 4;
                ctx.fillRect(reelXLocal, headerYOffset + headerHeight * 0.1, headerWidth * 0.5, headerHeight * 0.8);
            } else {
                ctx.fillRect(reelXLocal, headerYOffset + headerHeight * 0.1, headerWidth * 0.5, headerHeight * 0.8);
            }
            ctx.fillStyle = bladeColor;
            ctx.fillRect(headerXLocal, headerYOffset + headerHeight * 0.9, headerWidth, headerHeight * 0.1);

            ctx.restore();
        };

        drawTractor(tractor);
        drawCombineHarvester(combineHarvester);

        // 9. Draw hitched equipment (only for tractor)
        if (tractor.equipment?.type === 'plow') {
            drawPlow(plow);
        } else if (tractor.equipment?.type === 'seeder') {
            drawSeeder(seeder);
        }

        // 10. Draw Player
        const drawPlayer = (p) => {
            if (p.isInVehicle) return;

            const frame = Math.floor(performance.now() / 100) % 2; // Simple time-based animation
            const skinColor = applyLightFactorToColor('#FFDAB9', ambientLightFactor);
            const hairColor = applyLightFactorToColor('#8B4513', ambientLightFactor);
            const shirtColor = applyLightFactorToColor('#4682B4', ambientLightFactor);
            const pantsColor = applyLightFactorToColor('#2F4F4F', ambientLightFactor);
            const shoeColor = applyLightFactorToColor('#5C4033', ambientLightFactor);
            const eyeColor = applyLightFactorToColor('#000000', ambientLightFactor);

            ctx.fillStyle = skinColor;
            ctx.fillRect(p.x - cameraX + p.width * 0.1, p.y - cameraY, p.width * 0.8, p.height * 0.25);
            ctx.fillStyle = hairColor;
            ctx.fillRect(p.x - cameraX + p.width * 0.1, p.y - cameraY - p.height * 0.05, p.width * 0.8, p.height * 0.1);
            ctx.fillStyle = eyeColor;
            if (p.facing === 'right') {
                ctx.fillRect(p.x - cameraX + p.width * 0.6, p.y - cameraY + p.height * 0.08, p.width * 0.2, p.height * 0.05);
                ctx.fillRect(p.x - cameraX + p.width * 0.3, p.y - cameraY + p.height * 0.08, p.width * 0.2, p.height * 0.05);
            } else {
                ctx.fillRect(p.x - cameraX + p.width * 0.2, p.y - cameraY + p.height * 0.08, p.width * 0.2, p.height * 0.05);
                ctx.fillRect(p.x - cameraX + p.width * 0.5, p.y - cameraY + p.height * 0.08, p.width * 0.2, p.height * 0.05);
            }

            ctx.fillStyle = shirtColor;
            ctx.fillRect(p.x - cameraX, p.y - cameraY + p.height * 0.2, p.width, p.height * 0.4);
            ctx.fillStyle = applyLightFactorToColor('#366B99', ambientLightFactor);
            ctx.fillRect(p.x - cameraX, p.y - cameraY + p.height * 0.5, p.width, p.height * 0.1);

            ctx.fillStyle = pantsColor;
            const legWidth = p.width * 0.4;
            const legHeight = p.height * 0.3;
            const legY = p.y + p.height * 0.7;

            if (p.vx !== 0) {
                if (frame === 0) {
                    ctx.fillRect(p.x - cameraX + p.width * 0.05, legY - cameraY, legWidth, legHeight);
                    ctx.fillRect(p.x - cameraX + p.width * 0.55, legY - cameraY + legHeight * 0.1, legWidth, legHeight);
                } else {
                    ctx.fillRect(p.x - cameraX + p.width * 0.05, legY - cameraY + legHeight * 0.1, legWidth, legHeight);
                    ctx.fillRect(p.x - cameraX + p.width * 0.55, legY - cameraY, legWidth, legHeight);
                }
            } else {
                ctx.fillRect(p.x - cameraX + p.width * 0.05, legY - cameraY, legWidth, legHeight);
                ctx.fillRect(p.x - cameraX + p.width * 0.55, legY - cameraY, legWidth, legHeight);
            }

            ctx.fillStyle = shoeColor;
            ctx.fillRect(p.x - cameraX + p.width * 0.05, p.y - cameraY + p.height - TILE_SIZE * 0.3, legWidth, TILE_SIZE * 0.3);
            ctx.fillRect(p.x - cameraX + p.width * 0.55, p.y - cameraY + p.height - TILE_SIZE * 0.3, legWidth, TILE_SIZE * 0.3);
        };
        drawPlayer(player);

        // 11. Draw Particles
        for (const p of particles) {
            ctx.save();
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x - cameraX, p.y - cameraY, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 12. Draw the minimap last to ensure it's on top
        const minimapScaleX = minimapCanvas.width / WORLD_WIDTH_PIXELS;
        const minimapScaleY = minimapCanvas.height / WORLD_HEIGHT_PIXELS;

        minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
        minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        minimapCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

        for (let y = 0; y < WORLD_HEIGHT_TILES; y++) {
            for (let x = 0; x < WORLD_WIDTH_TILES; x++) {
                const tile = world[y][x];
                let color = getSkyColor(gameTime, skyColors);

                if (tile.type === TILE_TYPE.GRASS) {
                    color = TILE_COLORS[TILE_TYPE.GRASS];
                } else if (tile.type === TILE_TYPE.DIRT) {
                    color = TILE_COLORS[TILE_TYPE.DIRT];
                } else if (tile.type === TILE_TYPE.TILLED) {
                    color = TILE_COLORS[TILE_TYPE.TILLED];
                } else if (tile.type === TILE_TYPE.CROP_PLANTED || tile.type === TILE_TYPE.CROP_GROWN) {
                    if (tile.crop) {
                        color = TILE_COLORS[tile.crop.type][tile.crop.stage];
                    }
                }
                minimapCtx.fillStyle = applyLightFactorToColor(color, ambientLightFactor);
                minimapCtx.fillRect(x * TILE_SIZE * minimapScaleX, y * TILE_SIZE * minimapScaleY, TILE_SIZE * minimapScaleX, TILE_SIZE * minimapScaleY);
            }
        }

        minimapCtx.fillStyle = applyLightFactorToColor('#8B4513', ambientLightFactor);
        for (const tree of trees) {
            minimapCtx.fillRect(tree.x * minimapScaleX, tree.y * minimapScaleY, tree.width * minimapScaleX, tree.height * minimapScaleY);
        }
        for (const barn of barns) {
            minimapCtx.fillRect(barn.x * minimapScaleX, barn.y * minimapScaleY, barn.width * minimapScaleX, barn.height * minimapScaleY);
        }
        for (const silo of silos) {
            minimapCtx.fillStyle = applyLightFactorToColor('#B0C4DE', ambientLightFactor);
            minimapCtx.fillRect(silo.x * minimapScaleX, silo.y * minimapScaleY, silo.width * minimapScaleX, silo.height * minimapScaleY);
        }

        minimapCtx.fillStyle = 'blue';
        minimapCtx.fillRect(player.x * minimapScaleX, player.y * minimapScaleY, player.width * minimapScaleX, player.height * minimapScaleY);

        minimapCtx.fillStyle = 'red';
        minimapCtx.fillRect(tractor.x * minimapScaleX, tractor.y * minimapScaleY, tractor.width * minimapScaleX, tractor.height * minimapScaleY);

        minimapCtx.fillStyle = 'gold';
        minimapCtx.fillRect(combineHarvester.x * minimapScaleX, combineHarvester.y * minimapScaleY, combineHarvester.width * minimapScaleX, combineHarvester.height * minimapScaleY);

        minimapCtx.strokeStyle = 'white';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(cameraX * minimapScaleX, cameraY * minimapScaleY, canvas.width * minimapScaleX, canvas.height * minimapScaleY);
    };

    useEffect(() => {
        const animationFrame = requestAnimationFrame(drawGame);
        return () => cancelAnimationFrame(animationFrame);
    }, [
        world, trees, barns, silos, clouds, birds, planes, balloons, particles,
        player, tractor, plow, seeder, combineHarvester,
        gameTime, cameraX, cameraY, tractorImageLoaded,
        sunState, moonState,
        TILE_SIZE, WORLD_WIDTH_TILES, WORLD_WIDTH_PIXELS,
        TILE_COLORS, CROP_STAGE, TILE_TYPE,
        getSkyColor, getAmbientLightFactor, applyLightFactorToColor,
        skyColors
    ]);

    return (
        <>
            <canvas id="game-canvas" ref={canvasRef} width="1200" height="600" className="border-2 border-white rounded-lg max-w-full max-h-[80vh] aspect-video"></canvas>
            <canvas ref={minimapCanvasRef} width="200" height="100" className="absolute bottom-5 right-5 border-2 border-white bg-black bg-opacity-70 rounded-lg"></canvas>
        </>
    );
};


// --- UI Overlay Component (previously in components/UIOverlay.js) ---
const UIOverlay = () => {
    const {
        player, tractor, combineHarvester, selectedCropType, setSelectedCropType,
        isShopOpen, setIsShopOpen, isSettingsOpen, setIsSettingsOpen, handleRefuel,
        statusMessage, statusVisible, moneyChangeAmount, moneyChangeVisible, moneyChangePosition
    } = useGame();

    return (
        <>
            <div className={`absolute top-5 left-1/2 -translate-x-1/2 p-3 bg-black bg-opacity-60 rounded-lg text-lg text-yellow-400 transition-opacity duration-300 ${statusVisible ? 'opacity-100' : 'opacity-0'}`}>
                {statusMessage}
            </div>

            {moneyChangeVisible && (
                <div
                    className={`fixed z-50 text-2xl font-bold transition-all duration-1500 ease-out-quad ${moneyChangeAmount > 0 ? 'text-green-400' : 'text-red-400'} animate-money-float`}
                    style={{ left: moneyChangePosition.x, top: moneyChangePosition.y }}
                >
                    {moneyChangeAmount > 0 ? '+' : ''}${moneyChangeAmount.toFixed(2)}
                </div>
            )}

            <style>
                {`
                @keyframes money-float {
                    0% {
                        transform: translate(-50%, 0);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(-50%, -50px);
                        opacity: 0;
                    }
                }
                .animate-money-float {
                    animation: money-float 1.5s forwards;
                }
                `}
            </style>

            <div className="absolute top-5 left-5 p-3 bg-black bg-opacity-60 rounded-lg text-base">
                Money: <span id="money-count">${player.money.toFixed(2)}</span><br />
                Fuel: <span id="fuel-level">
                    {tractor.isInVehicle ? `${tractor.fuel.toFixed(1)} / ${tractor.maxFuel}` :
                     combineHarvester.isInVehicle ? `${combineHarvester.fuel.toFixed(1)} / ${combineHarvester.maxFuel}` : 'N/A'}
                </span><br/>
                Storage: <span id="storage-count">
                    {Object.values(player.inventory).filter(val => typeof val === 'number' && !String(val).includes('Seeds')).reduce((acc, curr) => acc + curr, 0)} / {player.maxStorage}
                </span>
                <div className="mt-2 pt-2 border-t border-gray-600">
                    <h4 className="font-bold mb-1">Inventory:</h4>
                    <div className="grid grid-cols-2 gap-1 text-sm">
                        <div className="flex items-center gap-1"><CropSeedIcon cropType={CROP_TYPE.WHEAT} /> Wheat Seeds: {player.inventory.wheatSeeds}</div>
                        <div className="flex items-center gap-1"><CropSeedIcon cropType={CROP_TYPE.CORN} /> Corn Seeds: {player.inventory.cornSeeds}</div>
                        <div className="flex items-center gap-1"><CropSeedIcon cropType={CROP_TYPE.POTATO} /> Potato Seeds: {player.inventory.potatoSeeds}</div>
                        <div className="flex items-center gap-1"><CropIcon cropType={CROP_TYPE.WHEAT} /> Wheat: {player.inventory.wheat}</div>
                        <div className="flex items-center gap-1"><CropIcon cropType={CROP_TYPE.CORN} /> Corn: {player.inventory.corn}</div>
                        <div className="flex items-center gap-1"><CropIcon cropType={CROP_TYPE.POTATO} /> Potato: {player.inventory.potato}</div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-5 left-5 flex flex-col gap-2 z-10">
                <button onClick={() => setIsShopOpen(true)} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md shadow-md transition-colors">
                    Shop
                </button>
                <button onClick={handleRefuel} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-md transition-colors">
                    Refuel Vehicle
                </button>
                <div className="flex gap-2 mt-2">
                    <span className="text-sm self-center">Plant:</span>
                    <button onClick={() => setSelectedCropType(CROP_TYPE.WHEAT)} className={`px-3 py-1 rounded-md text-sm ${selectedCropType === CROP_TYPE.WHEAT ? 'bg-indigo-700' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                        Wheat
                    </button>
                    <button onClick={() => setSelectedCropType(CROP_TYPE.CORN)} className={`px-3 py-1 rounded-md text-sm ${selectedCropType === CROP_TYPE.CORN ? 'bg-indigo-700' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                        Corn
                    </button>
                    <button onClick={() => setSelectedCropType(CROP_TYPE.POTATO)} className={`px-3 py-1 rounded-md text-sm ${selectedCropType === CROP_TYPE.POTATO ? 'bg-indigo-700' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
                        Potato
                    </button>
                </div>
            </div>

            <div className="absolute top-5 right-5 z-10">
                <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-3 bg-gray-600 hover:bg-gray-700 text-white rounded-full shadow-md transition-colors"
                    aria-label="Settings"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.78 1.28a2 2 0 0 0 .73 2.73l.04.02a2 2 0 0 1 .97 2.18v.44a2 2 0 0 1-.97 2.18l-.04.02a2 2 0 0 0-.73 2.73l.78 1.28a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.78-1.28a2 2 0 0 0-.73-2.73l-.04-.02a2 2 0 0 1-.97-2.18v-.44a2 2 0 0 1 .97-2.18l.04-.02a2 2 0 0 0 .73-2.73l-.78-1.28a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
            </div>

            {/* Controls Info - Moved back into UIOverlay for single-file version */}
            <div id="controls" className="mt-4 p-3 bg-black bg-opacity-50 rounded-lg text-center leading-relaxed">
                <strong className="text-lg">Controls:</strong><br />
                <span className="block"><strong>A/D</strong> or <strong>Left/Right Arrows</strong>: Move</span>
                <span className="block"><strong>W</strong> or <strong>Up Arrow</strong>: Jump</span>
                <span className="block"><strong>E</strong>: Enter/Exit Closest Vehicle</span>
                <span className="block"><strong>H</strong>: Hitch/Unhitch Closest Attachment (for Tractor)</span>
                <span className="block"><strong>F</strong>: Use Hand Tool (Till Soil)</span>
                <span className="block"><strong>G</strong>: Plant <span className="text-yellow-400">{selectedCropType.charAt(0).toUpperCase() + selectedCropType.slice(1)}</span> (Manual)</span>
                <span className="block"><strong>J</strong>: Harvest Wheat (Manual)</span>
            </div>
        </>
    );
};


// --- Shop Modal Component (previously in components/ShopModal.js) ---
const ShopModal = () => {
    const {
        player, tractor, combineHarvester,
        setIsShopOpen, handleBuySeeds, handleSellCrops, handleBuildSilo, handleUpgradeVehicle
    } = useGame();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-700 p-8 rounded-lg shadow-xl border-2 border-white w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <h2 className="text-3xl font-bold mb-6 text-center text-yellow-300">Farm Shop</h2>
                <p className="text-xl mb-6 text-center">Your Money: <span className="text-green-400">${player.money.toFixed(2)}</span></p>

                {/* Buy Seeds Section */}
                <div className="mb-8">
                    <h3 className="text-2xl font-semibold mb-4 text-blue-300">Buy Seeds</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(SEED_PRICES).map(([seedType, price]) => (
                            <div key={seedType} className="bg-gray-800 p-4 rounded-md flex items-center justify-between"
                                title={`Buy 10 units of ${seedType.replace('Seeds', '')} seeds.`}>
                                <div className="flex items-center gap-2">
                                    <CropSeedIcon cropType={seedType.replace('Seeds', '')} size={24}/>
                                    <span className="text-lg capitalize">{seedType.replace('Seeds', '')} Seeds</span>
                                </div>
                                <span className="text-lg text-green-300">${price.toFixed(2)} / unit</span>
                                <button
                                    onClick={() => handleBuySeeds(seedType, 10)}
                                    className="ml-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                                >
                                    Buy 10 (${(price * 10).toFixed(2)})
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Sell Crops Section */}
                <div className="mb-8">
                    <h3 className="2xl font-semibold mb-4 text-orange-300">Sell Crops</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        {Object.entries(CROP_PRICES).map(([cropType, price]) => (
                            <div key={cropType} className="bg-gray-800 p-4 rounded-md flex items-center justify-between"
                                title={`Sell all ${cropType} you have. Current stock: ${player.inventory[cropType]}.`}>
                                <div className="flex items-center gap-2">
                                    <CropIcon cropType={cropType} size={24}/>
                                    <span className="text-lg capitalize">{cropType}</span>
                                </div>
                                <span className="text-lg">In Stock: {player.inventory[cropType]}</span>
                                <span className="text-lg text-green-300">Sell Price: ${price.toFixed(2)}</span>
                                <button
                                    onClick={() => handleSellCrops(cropType)}
                                    className="ml-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
                                >
                                    Sell All (${(player.inventory[cropType] * price).toFixed(2)})
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => handleSellCrops()}
                        className="w-full px-6 py-3 bg-red-800 hover:bg-red-900 text-white text-xl font-bold rounded-md shadow-lg transition-colors"
                    >
                        Sell All Available Crops
                    </button>
                </div>

                {/* Build Structures Section */}
                <div className="mb-8">
                    <h3 className="text-2xl font-semibold mb-4 text-purple-300">Build Structures</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-gray-800 p-4 rounded-md flex items-center justify-between"
                            title="Build a silo to increase your crop storage capacity.">
                            <span className="text-lg">Silo</span>
                            <span className="text-lg text-green-300">Cost: ${STRUCTURE_PRICES.silo.toFixed(2)}</span>
                            <button
                                onClick={handleBuildSilo}
                                disabled={player.siloBuilt}
                                className={`ml-4 px-4 py-2 text-white rounded-md transition-colors ${player.siloBuilt ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {player.siloBuilt ? 'Built' : 'Build'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Upgrade Vehicles Section */}
                <div className="mb-8">
                    <h3 className="text-2xl font-semibold mb-4 text-yellow-300">Upgrade Vehicles</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Tractor Upgrade */}
                        <div className="bg-gray-800 p-4 rounded-md flex items-center justify-between"
                            title={`Upgrade your tractor for increased speed and fuel capacity. Current Level: ${tractor.upgradeLevel}.`}>
                            <span className="text-lg">Tractor (Lvl {tractor.upgradeLevel})</span>
                            {tractor.upgradeLevel < VEHICLE_UPGRADE_TIERS.tractor.length - 1 ? (
                                <>
                                    <span className="text-lg text-green-300">
                                        Cost: ${VEHICLE_UPGRADE_TIERS.tractor[tractor.upgradeLevel + 1].cost.toFixed(2)}
                                    </span>
                                    <button
                                        onClick={() => handleUpgradeVehicle('tractor')}
                                        className="ml-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
                                    >
                                        Upgrade
                                    </button>
                                </>
                            ) : (
                                <span className="text-lg text-gray-400">Max Level</span>
                            )}
                        </div>
                        {/* Combine Harvester Upgrade */}
                        <div className="bg-gray-800 p-4 rounded-md flex items-center justify-between"
                            title={`Upgrade your combine harvester for increased speed and fuel capacity. Current Level: ${combineHarvester.upgradeLevel}.`}>
                            <span className="text-lg">Combine (Lvl {combineHarvester.upgradeLevel})</span>
                            {combineHarvester.upgradeLevel < VEHICLE_UPGRADE_TIERS.combineHarvester.length - 1 ? (
                                <>
                                    <span className="text-lg text-green-300">
                                        Cost: ${VEHICLE_UPGRADE_TIERS.combineHarvester[combineHarvester.upgradeLevel + 1].cost.toFixed(2)}
                                    </span>
                                    <button
                                        onClick={() => handleUpgradeVehicle('combineHarvester')}
                                        className="ml-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
                                    >
                                        Upgrade
                                    </button>
                                </>
                            ) : (
                                <span className="text-lg text-gray-400">Max Level</span>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => setIsShopOpen(false)}
                    className="mt-8 w-full px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white text-xl font-bold rounded-md shadow-lg transition-colors"
                >
                    Close Shop
                </button>
            </div>
        </div>
    );
};


// --- Settings Modal Component (previously in components/SettingsModal.js) ---
const SettingsModal = () => {
    const { setIsSettingsOpen, saveGame, loadGame, isAuthReady } = useGame();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-700 p-8 rounded-lg shadow-xl border-2 border-white w-full max-w-md">
                <h2 className="text-3xl font-bold mb-6 text-center text-yellow-300">Settings</h2>
                <div className="flex flex-col gap-4">
                    {isAuthReady && (
                        <>
                            <button onClick={saveGame} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white text-xl font-bold rounded-md shadow-lg transition-colors">
                                Save Game
                            </button>
                            <button onClick={loadGame} className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white text-xl font-bold rounded-md shadow-lg transition-colors">
                                Load Game
                            </button>
                        </>
                    )}
                    {!isAuthReady && (
                        <p className="text-center text-red-400">Firebase not ready. Save/Load unavailable.</p>
                    )}
                </div>
                <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="mt-8 w-full px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white text-xl font-bold rounded-md shadow-lg transition-colors"
                >
                    Close Settings
                </button>
            </div>
        </div>
    );
};


// --- Main App Component (previously in App.js) ---
const App = () => {
    return (
        <GameProvider>
            <GameContent />
        </GameProvider>
    );
};

// This component uses the context to access game state and render modals conditionally
const GameContent = () => {
    const { isShopOpen, isSettingsOpen } = useGame();

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-800 text-white font-mono p-4">
            <GameCanvas />
            <UIOverlay />
            {isShopOpen && <ShopModal />}
            {isSettingsOpen && <SettingsModal />}
        </div>
    );
};

export default App;
