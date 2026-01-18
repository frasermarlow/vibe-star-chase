import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Sound effect
const gemSound = new Audio('sound1.m4a');
gemSound.volume = 0.5;

function playGemSound() {
    gemSound.currentTime = 0; // Reset to start for rapid replays
    gemSound.play().catch(() => {}); // Ignore autoplay restrictions
}

// Game state
const state = {
    playerTile: null,
    enemyTiles: [],
    tiles: [],
    playerMesh: null,
    enemyMeshes: [],
    gameOver: false,
    moveCount: 0,
    portalTiles: [], // Two portal tile indices
    blockedTiles: new Set(), // Tall impassable tiles (Giant's Causeway style)
    waterTiles: new Set(), // Water tiles - player drowns if they step on these
    lavaTiles: new Set(), // Lava tiles - player dies, but auto-path doesn't avoid them
    portalEffects: [], // Visual effects for portals
    // Power orb - allows player to catch enemies for 10 moves
    orbTile: null,          // Tile index where orb is placed
    orbMesh: null,          // Visual orb object
    orbActive: false,       // Whether orb power is currently active
    orbMovesRemaining: 0,   // Moves left with orb power
    gemTiles: [], // Tiles with collectible gems
    gemMeshes: [], // Visual gem objects
    gemsCollected: 0,
    totalGems: 5,
    round: 1,
    // Smooth camera tracking (follows player while rotating around planet center)
    cameraTargetPosition: new THREE.Vector3(),
    cameraIsTracking: false,
    // Locked movement direction (world-space) for consistent keyboard navigation
    lockedMoveDirection: null,  // THREE.Vector3 - direction locked on first keypress
    heldKey: null,              // Currently held movement key
    // Key label sprites for adjacent hexagons
    keyLabels: [],
    // Auto-pathfinding queue
    pathQueue: [],              // Array of tile indices to move through
    isAutoMoving: false,        // Whether auto-movement is in progress
    // Planet configuration
    planetGroup: null,          // Reference to planet group for regeneration
    baseRadius: 20,             // Base planet radius at level 1
    baseSubdivisions: 3,        // Base subdivisions at level 1 (gives ~642 cells: 10 * 4^3 + 2)
    // Intro animation
    introPlaying: false,        // Whether intro animation is playing
    introStartTime: 0,          // When intro started
    introDuration: 2500,        // Intro duration in ms
    introStartPos: new THREE.Vector3(),  // Camera start position
    introEndPos: new THREE.Vector3(),    // Camera end position
    playerIntroStart: new THREE.Vector3(), // Player start position (in space)
    playerIntroEnd: new THREE.Vector3(),   // Player end position (on planet)
    // Splash screen
    splashDismissed: false                 // Whether the splash screen has been dismissed
};

// Scene setup
const container = document.getElementById('game-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Starfield background
scene.background = new THREE.Color(0x0a0a20);
createStarfield();

// Lighting - dramatic Death Star lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
sunLight.position.set(100, 60, 100);
scene.add(sunLight);

// Rim light for dramatic effect
const rimLight = new THREE.DirectionalLight(0x8888ff, 0.4);
rimLight.position.set(-50, -30, -50);
scene.add(rimLight);

// Point light for metallic reflections
const pointLight = new THREE.PointLight(0xffffff, 0.5, 200);
pointLight.position.set(0, 50, 50);
scene.add(pointLight);

// Camera controls - rotate around planet center (0,0,0)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 60;
controls.target.set(0, 0, 0); // Always rotate around planet center
controls.enablePan = false; // Disable panning - only rotation and zoom
controls.minPolarAngle = 0; // Allow full vertical rotation
controls.maxPolarAngle = Math.PI; // Allow full vertical rotation

camera.position.set(0, 30, 50);
controls.update();

// Cancel camera tracking when user manually rotates
controls.addEventListener('start', () => {
    state.cameraIsTracking = false;
});

// Update key labels when user rotates/pans camera
controls.addEventListener('change', () => {
    if (state.playerTile !== null && !state.gameOver) {
        updateKeyLabels(state.playerTile);
    }
});

// Raycaster for click detection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Create starfield
function createStarfield() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });

    const starsVertices = [];
    const minDistance = 120; // Beyond max camera distance (100)
    const maxDistance = 400;

    for (let i = 0; i < 2000; i++) {
        // Generate stars on a spherical shell beyond the camera's max zoom
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const distance = minDistance + Math.random() * (maxDistance - minDistance);

        const x = distance * Math.sin(phi) * Math.cos(theta);
        const y = distance * Math.sin(phi) * Math.sin(theta);
        const z = distance * Math.cos(phi);

        starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
}

// Create a text sprite for key labels
function createKeyLabel(text) {
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw circular background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = '#88aaff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Draw text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.2, 1.2, 1);

    return sprite;
}

// Geodesic Hexagonal Sphere using subdivided icosahedron
// This creates a proper hex grid with 12 pentagons at icosahedron vertices

class GeodesicHexSphere {
    constructor(radius, subdivisions) {
        this.radius = radius;
        this.subdivisions = subdivisions;
        this.vertices = [];
        this.faces = [];
        this.cells = []; // hex/pentagon cells
        this.vertexToCell = new Map();

        this.generateIcosahedron();
        this.subdivide();
        this.generateDualMesh();
    }

    generateIcosahedron() {
        // Golden ratio
        const t = (1 + Math.sqrt(5)) / 2;

        // Icosahedron vertices
        const verts = [
            [-1,  t,  0], [ 1,  t,  0], [-1, -t,  0], [ 1, -t,  0],
            [ 0, -1,  t], [ 0,  1,  t], [ 0, -1, -t], [ 0,  1, -t],
            [ t,  0, -1], [ t,  0,  1], [-t,  0, -1], [-t,  0,  1]
        ];

        // Normalize to unit sphere
        verts.forEach(v => {
            const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
            this.vertices.push(new THREE.Vector3(v[0]/len, v[1]/len, v[2]/len));
        });

        // Icosahedron faces (20 triangles)
        this.faces = [
            [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
            [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
            [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
            [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
        ];
    }

    getMidpoint(v1, v2) {
        const mid = new THREE.Vector3().addVectors(v1, v2).normalize();
        return mid;
    }

    getVertexKey(v) {
        return `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`;
    }

    subdivide() {
        for (let i = 0; i < this.subdivisions; i++) {
            const newFaces = [];
            const midpointCache = new Map();

            const getMidpointIndex = (i1, i2) => {
                const key = i1 < i2 ? `${i1}-${i2}` : `${i2}-${i1}`;
                if (midpointCache.has(key)) {
                    return midpointCache.get(key);
                }
                const mid = this.getMidpoint(this.vertices[i1], this.vertices[i2]);
                const idx = this.vertices.length;
                this.vertices.push(mid);
                midpointCache.set(key, idx);
                return idx;
            };

            for (const face of this.faces) {
                const [a, b, c] = face;
                const ab = getMidpointIndex(a, b);
                const bc = getMidpointIndex(b, c);
                const ca = getMidpointIndex(c, a);

                newFaces.push([a, ab, ca]);
                newFaces.push([b, bc, ab]);
                newFaces.push([c, ca, bc]);
                newFaces.push([ab, bc, ca]);
            }

            this.faces = newFaces;
        }
    }

    generateDualMesh() {
        // Build vertex to faces mapping
        const vertexFaces = new Map();

        this.faces.forEach((face, faceIdx) => {
            face.forEach(vertIdx => {
                if (!vertexFaces.has(vertIdx)) {
                    vertexFaces.set(vertIdx, []);
                }
                vertexFaces.get(vertIdx).push(faceIdx);
            });
        });

        // Calculate face centers
        const faceCenters = this.faces.map(face => {
            const center = new THREE.Vector3();
            face.forEach(idx => center.add(this.vertices[idx]));
            center.divideScalar(3).normalize();
            return center;
        });

        // Create cells (dual vertices = original face centers)
        // Each original vertex becomes a cell (hex or pentagon)
        vertexFaces.forEach((faceIndices, vertIdx) => {
            const vertex = this.vertices[vertIdx];

            // Get face centers around this vertex
            const cellCorners = faceIndices.map(fi => faceCenters[fi].clone());

            // Sort corners in circular order around the vertex
            this.sortCornersCircular(cellCorners, vertex);

            // Find neighbors (vertices that share an edge)
            const neighbors = new Set();
            faceIndices.forEach(fi => {
                this.faces[fi].forEach(vi => {
                    if (vi !== vertIdx) neighbors.add(vi);
                });
            });

            this.cells.push({
                center: vertex.clone().multiplyScalar(this.radius),
                corners: cellCorners.map(c => c.multiplyScalar(this.radius)),
                vertexIndex: vertIdx,
                neighbors: Array.from(neighbors),
                isPentagon: cellCorners.length === 5
            });

            this.vertexToCell.set(vertIdx, this.cells.length - 1);
        });

        // Convert neighbor vertex indices to cell indices
        this.cells.forEach(cell => {
            cell.neighbors = cell.neighbors.map(vi => this.vertexToCell.get(vi));
        });
    }

    sortCornersCircular(corners, center) {
        // Create a reference direction perpendicular to center
        const up = new THREE.Vector3(0, 1, 0);
        const ref = new THREE.Vector3().crossVectors(center, up).normalize();
        if (ref.length() < 0.1) {
            ref.crossVectors(center, new THREE.Vector3(1, 0, 0)).normalize();
        }

        const angles = corners.map(corner => {
            const toCorner = corner.clone().sub(center).normalize();
            const cross = new THREE.Vector3().crossVectors(ref, toCorner);
            const dot = ref.dot(toCorner);
            const angle = Math.atan2(cross.dot(center), dot);
            return angle;
        });

        // Sort by angle
        const indexed = corners.map((c, i) => ({ corner: c, angle: angles[i] }));
        indexed.sort((a, b) => a.angle - b.angle);

        for (let i = 0; i < corners.length; i++) {
            corners[i] = indexed[i].corner;
        }
    }
}

// Create 3D cell geometry directly from world-space corners
function createCellGeometry3D(corners, center, normal, gapScale = 0.93, extrudeAmount = 0.15) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const normals = [];

    const n = corners.length;

    // Scale corners inward slightly for gaps between cells
    const scaledCorners = corners.map(corner => {
        const toCorner = corner.clone().sub(center);
        return center.clone().add(toCorner.multiplyScalar(gapScale));
    });

    // Extrude outward along normal
    const outerCorners = scaledCorners.map(c => {
        return c.clone().add(normal.clone().multiplyScalar(extrudeAmount));
    });
    const outerCenter = center.clone().add(normal.clone().multiplyScalar(extrudeAmount));

    // Build vertices: inner corners, outer corners, inner center, outer center
    // Inner corners (on sphere surface)
    scaledCorners.forEach(c => {
        vertices.push(c.x, c.y, c.z);
        normals.push(normal.x, normal.y, normal.z);
    });

    // Outer corners (extruded)
    outerCorners.forEach(c => {
        vertices.push(c.x, c.y, c.z);
        normals.push(normal.x, normal.y, normal.z);
    });

    // Inner center
    vertices.push(center.x, center.y, center.z);
    normals.push(normal.x, normal.y, normal.z);

    // Outer center
    vertices.push(outerCenter.x, outerCenter.y, outerCenter.z);
    normals.push(normal.x, normal.y, normal.z);

    const innerCenterIdx = n * 2;
    const outerCenterIdx = n * 2 + 1;

    // Top face (outer) - triangles from center to each edge
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        indices.push(outerCenterIdx, n + i, n + next);
    }

    // Bottom face (inner) - triangles from center to each edge (reversed winding)
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        indices.push(innerCenterIdx, next, i);
    }

    // Side faces - quads as two triangles each
    for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        // Inner edge: i, next
        // Outer edge: n+i, n+next
        // Quad: i, next, n+next, n+i
        indices.push(i, next, n + next);
        indices.push(i, n + next, n + i);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals(); // Recompute for smooth shading on sides

    return geometry;
}

// Create the hex planet with geodesic grid
function createHexPlanet(planetRadius, subdivisions, level = 1) {
    const planet = new THREE.Group();

    // Generate geodesic hex sphere
    const geoSphere = new GeodesicHexSphere(planetRadius, subdivisions);

    // Create core sphere - dark gray Death Star interior
    const coreGeometry = new THREE.SphereGeometry(planetRadius * 0.99, 64, 64);
    const coreMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.9,
        metalness: 0.1
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    planet.add(core);

    // First pass: identify blocked/tall tiles
    const tallTiles = new Set();
    geoSphere.cells.forEach((cell, index) => {
        const { isPentagon } = cell;
        const isTall = isPentagon || (level >= 2 && Math.random() < 0.05);
        if (isTall) {
            tallTiles.add(index);
            state.blockedTiles.add(index);
        }
    });

    // Generate water clusters (level 3+): clusters of 3-6 connected hexagons
    if (level >= 3) {
        const numClusters = Math.floor(geoSphere.cells.length * 0.015); // ~1.5% of tiles as cluster seeds
        const usedForWater = new Set();

        for (let c = 0; c < numClusters; c++) {
            // Find a valid seed tile (not tall, not already water)
            let seedIndex = -1;
            let attempts = 0;
            while (seedIndex < 0 && attempts < 50) {
                const candidate = Math.floor(Math.random() * geoSphere.cells.length);
                if (!tallTiles.has(candidate) && !usedForWater.has(candidate)) {
                    seedIndex = candidate;
                }
                attempts++;
            }
            if (seedIndex < 0) continue;

            // Grow cluster from seed (3-6 tiles)
            const clusterSize = 3 + Math.floor(Math.random() * 4); // 3 to 6
            const cluster = [seedIndex];
            usedForWater.add(seedIndex);

            while (cluster.length < clusterSize) {
                // Pick a random tile from cluster and try to expand
                const expandFrom = cluster[Math.floor(Math.random() * cluster.length)];
                const neighbors = geoSphere.cells[expandFrom].neighbors;

                // Find valid neighbor to add
                const validNeighbors = neighbors.filter(n =>
                    !tallTiles.has(n) && !usedForWater.has(n)
                );

                if (validNeighbors.length === 0) break; // Can't expand further

                const newTile = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
                cluster.push(newTile);
                usedForWater.add(newTile);
            }

            // Add cluster to water tiles
            cluster.forEach(idx => state.waterTiles.add(idx));
        }
    }

    // Generate lava clusters (level 8+): clusters of 3-6 connected hexagons
    // Lava kills player but auto-pathing doesn't avoid it (unlike water)
    if (level >= 8) {
        const numClusters = Math.floor(geoSphere.cells.length * 0.012); // ~1.2% of tiles as cluster seeds
        const usedForLava = new Set();

        for (let c = 0; c < numClusters; c++) {
            // Find a valid seed tile (not tall, not water, not already lava)
            let seedIndex = -1;
            let attempts = 0;
            while (seedIndex < 0 && attempts < 50) {
                const candidate = Math.floor(Math.random() * geoSphere.cells.length);
                if (!tallTiles.has(candidate) && !state.waterTiles.has(candidate) && !usedForLava.has(candidate)) {
                    seedIndex = candidate;
                }
                attempts++;
            }
            if (seedIndex < 0) continue;

            // Grow cluster from seed (3-6 tiles)
            const clusterSize = 3 + Math.floor(Math.random() * 4); // 3 to 6
            const cluster = [seedIndex];
            usedForLava.add(seedIndex);

            while (cluster.length < clusterSize) {
                // Pick a random tile from cluster and try to expand
                const expandFrom = cluster[Math.floor(Math.random() * cluster.length)];
                const neighbors = geoSphere.cells[expandFrom].neighbors;

                // Find valid neighbor to add
                const validNeighbors = neighbors.filter(n =>
                    !tallTiles.has(n) && !state.waterTiles.has(n) && !usedForLava.has(n)
                );

                if (validNeighbors.length === 0) break; // Can't expand further

                const newTile = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
                cluster.push(newTile);
                usedForLava.add(newTile);
            }

            // Add cluster to lava tiles
            cluster.forEach(idx => state.lavaTiles.add(idx));
        }
    }

    // Create cells (hexagons and pentagons)
    geoSphere.cells.forEach((cell, index) => {
        const { center, corners, neighbors, isPentagon } = cell;
        const normal = center.clone().normalize();

        // Check if this tile is tall (pre-computed)
        const isTall = tallTiles.has(index);
        const extrudeAmount = isTall ? 0.8 + Math.random() * 0.6 : 0.15; // Tall tiles are 0.8-1.4 units high

        // Check if this tile is water or lava (pre-computed from clusters)
        const isWater = state.waterTiles.has(index);
        const isLava = state.lavaTiles.has(index);

        // Create 3D geometry directly from corners
        const cellGeometry = createCellGeometry3D(corners, center, normal, 0.92, extrudeAmount);

        // Death Star panel colors - varying shades of gray/white
        const panelType = Math.random();
        let baseColor;

        if (isTall) {
            // Tall blocked tiles (pentagons and random obstacles) - darker basalt-like color
            baseColor = new THREE.Color().setHSL(0, 0, 0.18 + Math.random() * 0.08);
        } else if (isWater) {
            // Water tiles - blue color with slight variation
            baseColor = new THREE.Color().setHSL(0.58, 0.8, 0.35 + Math.random() * 0.1);
        } else if (isLava) {
            // Lava tiles - red/orange molten color
            baseColor = new THREE.Color().setHSL(0.03 + Math.random() * 0.04, 0.9, 0.4 + Math.random() * 0.15);
        } else if (panelType > 0.85) {
            // Darker accent panels
            baseColor = new THREE.Color().setHSL(0, 0, 0.28 + Math.random() * 0.1);
        } else if (panelType > 0.7) {
            // Medium gray panels
            baseColor = new THREE.Color().setHSL(0, 0, 0.48 + Math.random() * 0.1);
        } else {
            // Light gray/white panels (most common)
            baseColor = new THREE.Color().setHSL(0, 0, 0.68 + Math.random() * 0.12);
        }

        const isHazard = isWater || isLava;
        const cellMaterial = new THREE.MeshStandardMaterial({
            color: baseColor,
            roughness: isTall ? 0.8 : (isWater ? 0.1 : (isLava ? 0.3 : 0.4 + Math.random() * 0.3)),
            metalness: isTall ? 0.2 : (isHazard ? 0.9 : 0.6 + Math.random() * 0.2),
            emissive: isLava ? new THREE.Color(0xff2200) : new THREE.Color(0x000000),
            emissiveIntensity: isLava ? 0.4 : 0,
            transparent: isHazard,
            opacity: isHazard ? 0.6 : 1.0,
            side: THREE.DoubleSide
        });

        const cellMesh = new THREE.Mesh(cellGeometry, cellMaterial);

        // Geometry is already in world space, no positioning needed

        // Store cell data
        cellMesh.userData = {
            index: index,
            center: center.clone(),
            neighbors: neighbors,
            isPentagon: isPentagon,
            isTall: isTall,
            isWater: isWater,
            isLava: isLava,
            originalColor: baseColor.clone()
        };

        state.tiles.push(cellMesh);
        planet.add(cellMesh);
    });

    return planet;
}

// Calculate planet parameters for a given level
// Each level is 10% larger in terms of hexagon count
function getPlanetParamsForLevel(level) {
    // Geodesic spheres have discrete cell counts: 642, 2562, 10242, etc.
    // Formula for cells: 10 * 4^subdivisions + 2
    // Increase subdivision every 3 levels for noticeable progression

    const baseCells = 10 * Math.pow(4, state.baseSubdivisions) + 2; // 642

    // Levels 1-3: sub 3 (642), Levels 4-6: sub 4 (2562), Levels 7-9+: sub 5 (10242)
    // Cap at subdivision 5 (10,242 tiles) for performance - beyond this browsers struggle
    const maxSubdivisions = 5;
    const subdivisions = Math.min(
        maxSubdivisions,
        state.baseSubdivisions + Math.floor((level - 1) / 3)
    );

    // Actual cells with this subdivision
    const actualCells = 10 * Math.pow(4, subdivisions) + 2;

    // Scale radius to maintain similar hex density
    const radius = state.baseRadius * Math.sqrt(actualCells / baseCells);

    return { subdivisions, radius, targetCells: actualCells };
}

// Regenerate the planet for a new level
function regeneratePlanet(level) {
    // Remove old planet and all its children
    if (state.planetGroup) {
        scene.remove(state.planetGroup);
        state.planetGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    // Clear old state
    state.tiles = [];
    state.blockedTiles = new Set();
    state.waterTiles = new Set();
    state.lavaTiles = new Set();

    // Remove old portal effects
    state.portalEffects.forEach(effect => scene.remove(effect));
    state.portalEffects = [];

    // Remove old gems
    state.gemMeshes.forEach(gem => scene.remove(gem));
    state.gemMeshes = [];
    state.gemTiles = [];

    // Remove old power orb
    if (state.orbMesh) {
        scene.remove(state.orbMesh);
        state.orbMesh = null;
    }
    state.orbTile = null;
    state.orbActive = false;
    state.orbMovesRemaining = 0;

    // Remove old key labels
    state.keyLabels.forEach(label => scene.remove(label));
    state.keyLabels = [];

    // Get parameters for this level
    const params = getPlanetParamsForLevel(level);

    // Create new planet (pass level for conditional features like tall tiles)
    state.planetGroup = createHexPlanet(params.radius, params.subdivisions, level);
    scene.add(state.planetGroup);

    const waterCount = state.waterTiles.size;
    console.log(`Level ${level}: ${state.tiles.length} hexagons, radius ${params.radius.toFixed(1)}, subdivisions ${params.subdivisions}${level >= 2 ? ', with obstacles' : ''}${level >= 3 ? `, ${waterCount} water tiles` : ''}`);

    return params;
}

// Create glowing red gem
function createGem(tile) {
    const group = new THREE.Group();
    const tileCenter = tile.userData.center.clone();
    const normal = tileCenter.clone().normalize();

    // Main gem crystal (octahedron shape)
    const gemGeom = new THREE.OctahedronGeometry(0.4, 0);
    const gemMat = new THREE.MeshStandardMaterial({
        color: 0xff0044,
        emissive: 0xff0022,
        emissiveIntensity: 0.8,
        roughness: 0.1,
        metalness: 0.9
    });
    const gem = new THREE.Mesh(gemGeom, gemMat);
    gem.scale.y = 1.3; // Elongate vertically
    group.add(gem);

    // Inner glow core
    const coreGeom = new THREE.OctahedronGeometry(0.25, 0);
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0xff4466,
        transparent: true,
        opacity: 0.7
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    core.scale.y = 1.3;
    group.add(core);

    // Outer glow aura
    const auraGeom = new THREE.SphereGeometry(0.6, 16, 16);
    const auraMat = new THREE.MeshBasicMaterial({
        color: 0xff2244,
        transparent: true,
        opacity: 0.25
    });
    const aura = new THREE.Mesh(auraGeom, auraMat);
    group.add(aura);

    // Light ring around base
    const ringGeom = new THREE.TorusGeometry(0.5, 0.05, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: 0.6
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.2;
    group.add(ring);

    // Position above tile
    group.position.copy(tileCenter.clone().add(normal.clone().multiplyScalar(0.8)));

    // Orient to stand on the tile surface
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, normal);
    group.quaternion.copy(quaternion);

    // Store tile reference
    group.userData.tileIndex = tile.userData.index;

    return group;
}

// Create glowing orange power orb
function createPowerOrb(tile) {
    const group = new THREE.Group();
    const tileCenter = tile.userData.center.clone();
    const normal = tileCenter.clone().normalize();

    // Main orb sphere
    const orbGeom = new THREE.SphereGeometry(0.45, 32, 32);
    const orbMat = new THREE.MeshStandardMaterial({
        color: 0xff8800,
        emissive: 0xff6600,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8
    });
    const orb = new THREE.Mesh(orbGeom, orbMat);
    group.add(orb);

    // Inner glow core
    const coreGeom = new THREE.SphereGeometry(0.3, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        transparent: true,
        opacity: 0.8
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    group.add(core);

    // Outer glow aura
    const auraGeom = new THREE.SphereGeometry(0.7, 16, 16);
    const auraMat = new THREE.MeshBasicMaterial({
        color: 0xff6600,
        transparent: true,
        opacity: 0.2
    });
    const aura = new THREE.Mesh(auraGeom, auraMat);
    group.add(aura);

    // Orbiting ring
    const ringGeom = new THREE.TorusGeometry(0.6, 0.04, 8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffcc00,
        transparent: true,
        opacity: 0.7
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    group.add(ring);

    // Second orbiting ring (perpendicular)
    const ring2 = new THREE.Mesh(ringGeom, ringMat);
    ring2.rotation.x = Math.PI / 2;
    group.add(ring2);

    // Position above tile
    group.position.copy(tileCenter.clone().add(normal.clone().multiplyScalar(1.0)));

    // Orient to stand on the tile surface
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, normal);
    group.quaternion.copy(quaternion);

    // Store tile reference
    group.userData.tileIndex = tile.userData.index;

    return group;
}

// Create player marker
function createPlayerMarker(color, emissiveColor) {
    const group = new THREE.Group();

    // Body
    const bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.6, 8, 16);
    const bodyMaterial = new THREE.MeshLambertMaterial({
        color: color,
        emissive: emissiveColor,
        emissiveIntensity: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    group.add(body);

    // Head
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16);
    const head = new THREE.Mesh(headGeometry, bodyMaterial);
    head.position.y = 1.1;
    group.add(head);

    // Glow ring
    const ringGeometry = new THREE.TorusGeometry(0.5, 0.05, 8, 32);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: emissiveColor });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    return group;
}

// Position player on a tile
function positionPlayerOnTile(playerMesh, tile, isPlayer = false, isInitial = false) {
    const position = tile.userData.center.clone();
    const normal = position.clone().normalize();

    playerMesh.position.copy(position);

    // Orient player to stand on the tile
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(up, normal);
    playerMesh.quaternion.copy(quaternion);

    // Move slightly above the surface
    playerMesh.position.add(normal.multiplyScalar(0.3));

    // Update camera to track player (don't increment move on initial placement)
    if (isPlayer && !isInitial) {
        updateCameraTarget(playerMesh.position.clone(), true);
    }
}

// Update camera to follow player while rotating around planet center
// Only adjusts camera if player is getting out of view - allows free rotation otherwise
function updateCameraTarget(targetPosition, incrementMove = true, isTeleport = false) {
    // Increment move count
    if (incrementMove) {
        state.moveCount++;
    }

    const currentDistance = camera.position.length();
    const playerDirection = targetPosition.clone().normalize();
    const currentCameraDir = camera.position.clone().normalize();

    // For teleports (portals), always follow the player to the other side
    if (isTeleport) {
        state.cameraTargetPosition.copy(playerDirection.clone().multiplyScalar(currentDistance));
        state.cameraIsTracking = true;
        return;
    }

    // Check if player is visible from current camera position
    // Dot product: 1 = same direction (player behind camera from planet view)
    //              0 = perpendicular (player at horizon)
    //             -1 = opposite (player directly in front)
    // We want to see if player is in front of camera, so we check angle between
    // camera-to-center and player-to-center directions
    const dotProduct = currentCameraDir.dot(playerDirection);

    // Only adjust camera if player is getting close to edge of view or behind camera
    // dotProduct > 0.5 means player is more than ~60 degrees from camera's view center
    // (camera looks at planet center, so player on same side as camera = hard to see)
    if (dotProduct > 0.5) {
        // Player is behind or at edge - smoothly rotate camera to bring them into view
        const targetCameraDir = currentCameraDir.clone()
            .lerp(playerDirection, 0.4)
            .normalize();

        state.cameraTargetPosition.copy(targetCameraDir.multiplyScalar(currentDistance));
        state.cameraIsTracking = true;
    }
    // If player is visible (dotProduct <= 0.5), don't move camera - let user's view stay
}

// Highlight valid move tiles
function highlightValidMoves(currentTileIndex) {
    // Reset all tiles
    state.tiles.forEach((tile, index) => {
        // Keep portal tiles glowing green
        if (state.portalTiles.includes(index)) {
            tile.material.color.set(0x00ff44);
            tile.material.emissive = new THREE.Color(0x00aa22);
        } else if (state.waterTiles.has(index)) {
            // Keep water tiles with blue glow
            tile.material.color.copy(tile.userData.originalColor);
            tile.material.emissive = new THREE.Color(0x002244);
        } else {
            tile.material.color.copy(tile.userData.originalColor);
            tile.material.emissive = new THREE.Color(0x000000);
        }
    });

    // Highlight neighbors with green glow (Death Star control panel style)
    const currentTile = state.tiles[currentTileIndex];
    currentTile.userData.neighbors.forEach(neighborIndex => {
        const neighbor = state.tiles[neighborIndex];
        // Don't highlight blocked tiles as valid moves
        if (state.blockedTiles.has(neighborIndex)) {
            return;
        }
        if (state.portalTiles.includes(neighborIndex)) {
            neighbor.material.emissive = new THREE.Color(0x00ff88); // Brighter green for portal
        } else {
            neighbor.material.emissive = new THREE.Color(0x003322);
        }
    });

    // Highlight current tile with brighter green (unless it's a portal)
    if (!state.portalTiles.includes(currentTileIndex)) {
        currentTile.material.emissive = new THREE.Color(0x005544);
    }

    // Update key labels on adjacent hexagons
    updateKeyLabels(currentTileIndex);
}

// Update key labels showing which key moves to which neighbor
// Uses optimal assignment with no threshold to ensure stable labels during camera movement
function updateKeyLabels(currentTileIndex) {
    // Remove existing labels
    state.keyLabels.forEach(label => scene.remove(label));
    state.keyLabels = [];

    if (state.gameOver) return;
    if (!state.tiles || !state.tiles[currentTileIndex]) return;

    // Hide labels on mobile/touch devices (no keyboard)
    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 768);
    if (isMobile) return;

    const currentTile = state.tiles[currentTileIndex];
    const neighbors = currentTile.userData.neighbors;
    const currentPos = currentTile.userData.center.clone();

    const keys = ['w', 'e', 'd', 'x', 'z', 'a'];

    // Build list of all (key, neighbor, dot) combinations
    // No threshold - every neighbor gets its best matching key for stable labels
    const candidates = [];

    for (const key of keys) {
        const worldDir = getWorldDirectionFromKey(key);
        if (!worldDir) continue;

        for (const neighborIdx of neighbors) {
            // Skip blocked tiles
            if (state.blockedTiles.has(neighborIdx)) continue;

            const neighborTile = state.tiles[neighborIdx];
            const neighborPos = neighborTile.userData.center.clone();
            const toNeighbor = neighborPos.clone().sub(currentPos).normalize();

            const dot = toNeighbor.dot(worldDir);
            candidates.push({ key, neighborIdx, dot });
        }
    }

    // Sort by dot product descending (best matches first)
    candidates.sort((a, b) => b.dot - a.dot);

    // Greedily assign: best matches get priority
    const usedKeys = new Set();
    const labeledNeighbors = new Set();

    for (const { key, neighborIdx } of candidates) {
        if (usedKeys.has(key)) continue;
        if (labeledNeighbors.has(neighborIdx)) continue;

        usedKeys.add(key);
        labeledNeighbors.add(neighborIdx);

        // Create and position the label
        const label = createKeyLabel(key.toUpperCase());
        const neighborTile = state.tiles[neighborIdx];
        const tileCenter = neighborTile.userData.center.clone();
        const normal = tileCenter.clone().normalize();

        // Position label above the tile
        label.position.copy(tileCenter).add(normal.multiplyScalar(1.5));
        scene.add(label);
        state.keyLabels.push(label);
    }
}

// Check if tile is a portal and get the destination
function getPortalDestination(tileIndex) {
    const portalIndex = state.portalTiles.indexOf(tileIndex);
    if (portalIndex === -1) return null;
    // Return the other portal
    return state.portalTiles[portalIndex === 0 ? 1 : 0];
}

// Collect gem at tile if present
function collectGemAtTile(tileIndex) {
    const gemIndex = state.gemTiles.indexOf(tileIndex);
    if (gemIndex !== -1) {
        // Remove gem from game
        state.gemTiles.splice(gemIndex, 1);
        const gemMesh = state.gemMeshes.splice(gemIndex, 1)[0];
        scene.remove(gemMesh);

        // Increment counter
        state.gemsCollected++;

        // Play sound effect
        playGemSound();

        // Update display
        updateGemDisplay();
    }
}

// BFS pathfinding - find shortest path from start to goal (avoids blocked tiles and water)
function findPath(startIndex, goalIndex, avoidWater = true) {
    if (startIndex === goalIndex) return [startIndex];

    const visited = new Set();
    const queue = [[startIndex]];
    visited.add(startIndex);

    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];

        const neighbors = state.tiles[current].userData.neighbors;
        for (const neighbor of neighbors) {
            // Skip blocked tiles (unless it's the goal - but goals shouldn't be blocked)
            if (state.blockedTiles.has(neighbor) && neighbor !== goalIndex) {
                continue;
            }
            // Skip water tiles when avoidWater is true (for auto-pathing)
            if (avoidWater && state.waterTiles.has(neighbor)) {
                continue;
            }
            if (neighbor === goalIndex) {
                return [...path, neighbor];
            }
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push([...path, neighbor]);
            }
        }
    }

    return null; // No path found
}

// Update enemy appearance to vulnerable state (when orb is active)
function setEnemiesVulnerable(vulnerable) {
    for (let i = 0; i < state.enemyMeshes.length; i++) {
        if (state.enemyTiles[i] < 0) continue; // Skip inactive enemies

        const enemy = state.enemyMeshes[i];
        const body = enemy.children[0];
        const head = enemy.children[1];
        const ring = enemy.children[2];

        if (vulnerable) {
            // Change to blue/ghostly appearance
            body.material.color.set(0x4444ff);
            body.material.emissive.set(0x2222aa);
            body.material.transparent = true;
            body.material.opacity = 0.7;
            head.material.color.set(0x4444ff);
            head.material.emissive.set(0x2222aa);
            head.material.transparent = true;
            head.material.opacity = 0.7;
            ring.material.color.set(0x8888ff);
        } else {
            // Restore normal red appearance
            body.material.color.set(0xff4444);
            body.material.emissive.set(0xff0000);
            body.material.transparent = false;
            body.material.opacity = 1.0;
            head.material.color.set(0xff4444);
            head.material.emissive.set(0xff0000);
            head.material.transparent = false;
            head.material.opacity = 1.0;
            ring.material.color.set(0xff0000);
        }
    }
}

// Move all enemies - towards player normally, away when orb is active
function moveEnemies() {
    // Track which tiles will be occupied after moves (only active enemies)
    const occupiedTiles = new Set(state.enemyTiles.filter(t => t >= 0));

    for (let i = 0; i < state.enemyTiles.length; i++) {
        const currentTile = state.enemyTiles[i];

        // Skip inactive enemies
        if (currentTile < 0) continue;

        // Remove current position from occupied (we're moving from it)
        occupiedTiles.delete(currentTile);

        if (state.orbActive) {
            // FLEE MODE: Move away from player
            const neighbors = state.tiles[currentTile].userData.neighbors;
            let bestTile = null;
            let bestDistance = -1;

            // Find the neighbor that maximizes distance from player
            for (const neighbor of neighbors) {
                if (!occupiedTiles.has(neighbor) && !state.blockedTiles.has(neighbor)) {
                    const pathToPlayer = findPath(neighbor, state.playerTile, false);
                    const distance = pathToPlayer ? pathToPlayer.length : Infinity;
                    if (distance > bestDistance) {
                        bestDistance = distance;
                        bestTile = neighbor;
                    }
                }
            }

            if (bestTile !== null) {
                state.enemyTiles[i] = bestTile;
                occupiedTiles.add(bestTile);
                positionPlayerOnTile(state.enemyMeshes[i], state.tiles[bestTile]);
            } else {
                // Can't move, stay in place
                occupiedTiles.add(currentTile);
            }
        } else {
            // CHASE MODE: Move towards player
            const path = findPath(currentTile, state.playerTile, false);

            if (path && path.length > 1) {
                const nextTile = path[1];

                // Check if the next tile is already occupied by another enemy
                if (!occupiedTiles.has(nextTile)) {
                    // Move to the next tile
                    state.enemyTiles[i] = nextTile;
                    occupiedTiles.add(nextTile);
                    positionPlayerOnTile(state.enemyMeshes[i], state.tiles[nextTile]);
                } else {
                    // Try to find an alternative adjacent tile that gets closer
                    const neighbors = state.tiles[currentTile].userData.neighbors;
                    let bestAltTile = null;
                    let bestAltDistance = Infinity;

                    for (const neighbor of neighbors) {
                        // Skip blocked tiles and occupied tiles (enemies can walk on water)
                        if (!occupiedTiles.has(neighbor) && neighbor !== state.playerTile && !state.blockedTiles.has(neighbor)) {
                            const altPath = findPath(neighbor, state.playerTile, false);
                            if (altPath && altPath.length < bestAltDistance) {
                                bestAltDistance = altPath.length;
                                bestAltTile = neighbor;
                            }
                        }
                    }

                    if (bestAltTile !== null) {
                        state.enemyTiles[i] = bestAltTile;
                        occupiedTiles.add(bestAltTile);
                        positionPlayerOnTile(state.enemyMeshes[i], state.tiles[bestAltTile]);
                    } else {
                        // Can't move, stay in place
                        occupiedTiles.add(currentTile);
                    }
                }
            } else {
                // No path or already at destination, stay in place
                occupiedTiles.add(currentTile);
            }
        }
    }
}

// Check if player caught any enemy
function playerCaughtEnemy() {
    for (const enemyTile of state.enemyTiles) {
        // Skip inactive enemies
        if (enemyTile < 0) continue;
        if (state.playerTile === enemyTile ||
            state.tiles[state.playerTile].userData.neighbors.includes(enemyTile)) {
            return true;
        }
    }
    return false;
}

// Check if any enemy caught player
function enemyCaughtPlayer() {
    for (const enemyTile of state.enemyTiles) {
        // Skip inactive enemies
        if (enemyTile < 0) continue;
        if (state.playerTile === enemyTile ||
            state.tiles[enemyTile].userData.neighbors.includes(state.playerTile)) {
            return true;
        }
    }
    return false;
}

// Catch enemies near player when orb power is active
function catchEnemiesNearPlayer() {
    const playerNeighbors = state.tiles[state.playerTile].userData.neighbors;

    for (let i = 0; i < state.enemyTiles.length; i++) {
        const enemyTile = state.enemyTiles[i];
        // Skip already inactive enemies
        if (enemyTile < 0) continue;

        // Check if enemy is on player tile or adjacent
        if (enemyTile === state.playerTile || playerNeighbors.includes(enemyTile)) {
            // Remove this enemy for the duration of the level
            state.enemyTiles[i] = -1; // Mark as inactive
            state.enemyMeshes[i].visible = false; // Hide the enemy
        }
    }
}

// Handle tile click
function onTileClick(tile) {
    if (state.gameOver) return;

    const clickedIndex = tile.userData.index;

    // Cannot move onto blocked (tall) tiles
    if (state.blockedTiles.has(clickedIndex)) {
        return;
    }

    // If already at the clicked tile, do nothing
    if (clickedIndex === state.playerTile) {
        return;
    }

    const currentTile = state.tiles[state.playerTile];

    // Check if clicked tile is an adjacent neighbor (direct move)
    if (currentTile.userData.neighbors.includes(clickedIndex)) {
        // Cancel any ongoing auto-movement
        state.pathQueue = [];
        state.isAutoMoving = false;
        // Execute single step move
        executePlayerMove(clickedIndex);
    } else {
        // Distant tile - calculate path and start auto-movement
        const path = findPath(state.playerTile, clickedIndex);
        if (path && path.length > 1) {
            // Store path (excluding current position)
            state.pathQueue = path.slice(1);
            state.isAutoMoving = true;
            // Start auto-movement
            executeNextPathStep();
        }
    }
}

// Execute a single player move to an adjacent tile
function executePlayerMove(targetIndex) {
    if (state.gameOver) return;

    // Move player
    state.playerTile = targetIndex;
    positionPlayerOnTile(state.playerMesh, state.tiles[targetIndex], true);

    // Check if player stepped on water (drowns!)
    if (state.waterTiles.has(targetIndex)) {
        state.pathQueue = [];
        state.isAutoMoving = false;
        endGame(false, 'drowned');
        return;
    }

    // Check if player stepped on lava (burns!)
    if (state.lavaTiles.has(targetIndex)) {
        state.pathQueue = [];
        state.isAutoMoving = false;
        endGame(false, 'burned');
        return;
    }

    // Check if player collected a gem
    collectGemAtTile(targetIndex);

    // Check if player collected the power orb
    if (state.orbTile !== null && targetIndex === state.orbTile) {
        // Activate orb power - player can catch enemies for 10 moves
        state.orbActive = true;
        state.orbMovesRemaining = 10;
        // Remove orb from game
        if (state.orbMesh) {
            scene.remove(state.orbMesh);
            state.orbMesh = null;
        }
        state.orbTile = null;
        // Make enemies look vulnerable and flee
        setEnemiesVulnerable(true);
    }

    // Check if player stepped on a portal
    const portalDestination = getPortalDestination(targetIndex);
    if (portalDestination !== null) {
        // Teleport to the other portal
        state.playerTile = portalDestination;
        positionPlayerOnTile(state.playerMesh, state.tiles[portalDestination], false); // Don't auto-update camera
        // Explicitly update camera with teleport flag for stronger follow
        updateCameraTarget(state.playerMesh.position.clone(), false, true);
        // Check for gem at portal destination too
        collectGemAtTile(portalDestination);
        // Check for orb at portal destination too
        if (state.orbTile !== null && portalDestination === state.orbTile) {
            state.orbActive = true;
            state.orbMovesRemaining = 10;
            if (state.orbMesh) {
                scene.remove(state.orbMesh);
                state.orbMesh = null;
            }
            state.orbTile = null;
            // Make enemies look vulnerable and flee
            setEnemiesVulnerable(true);
        }
        // Clear path queue since we teleported
        state.pathQueue = [];
        state.isAutoMoving = false;
    }

    // Check if player collected all gems
    if (state.gemsCollected >= state.totalGems) {
        state.pathQueue = [];
        state.isAutoMoving = false;
        endGame(true); // Player wins
        return;
    }

    // If orb power is active, check if player catches any enemies
    if (state.orbActive) {
        catchEnemiesNearPlayer();
        state.orbMovesRemaining--;
        if (state.orbMovesRemaining <= 0) {
            state.orbActive = false;
            // Restore enemies to normal appearance and behavior
            setEnemiesVulnerable(false);
        }
    }

    // Enemies' turn - each moves one step closer
    moveEnemies();

    // Check if any enemy caught player (only if orb not active)
    if (!state.orbActive && enemyCaughtPlayer()) {
        state.pathQueue = [];
        state.isAutoMoving = false;
        endGame(false); // Enemy wins
        return;
    }

    // Update display
    updateGemDisplay();

    // Highlight valid moves for player
    highlightValidMoves(state.playerTile);

    // Continue auto-movement if there's more path
    if (state.isAutoMoving && state.pathQueue.length > 0) {
        setTimeout(executeNextPathStep, 300); // 300ms delay between steps
    } else {
        state.isAutoMoving = false;
    }
}

// Execute the next step in the auto-movement path
function executeNextPathStep() {
    if (state.gameOver || state.pathQueue.length === 0) {
        state.isAutoMoving = false;
        return;
    }

    const nextTile = state.pathQueue.shift();

    // Verify the move is still valid (path might be blocked now)
    const currentTile = state.tiles[state.playerTile];
    if (!currentTile.userData.neighbors.includes(nextTile) || state.blockedTiles.has(nextTile)) {
        // Path is no longer valid, recalculate
        if (state.pathQueue.length > 0) {
            const finalDestination = state.pathQueue[state.pathQueue.length - 1];
            const newPath = findPath(state.playerTile, finalDestination);
            if (newPath && newPath.length > 1) {
                state.pathQueue = newPath.slice(1);
                executeNextPathStep();
                return;
            }
        }
        // Cannot continue, stop auto-movement
        state.pathQueue = [];
        state.isAutoMoving = false;
        return;
    }

    executePlayerMove(nextTile);
}

// End the game
function endGame(playerWins, reason = 'caught') {
    state.gameOver = true;

    // Clear key labels
    state.keyLabels.forEach(label => scene.remove(label));
    state.keyLabels = [];

    const winMessage = document.getElementById('win-message');
    const winnerText = document.getElementById('winner-text');
    const button = winMessage.querySelector('button');

    if (playerWins) {
        let completionMessage = `Round ${state.round} Complete!<br><span style="font-size: 18px;">All ${state.totalGems} gems collected!</span>`;

        // Add info about new features in the next level
        const nextLevel = state.round + 1;
        let newFeatures = [];

        if (nextLevel === 2) {
            newFeatures.push('<span style="color: #888;">Elevated obstacles</span> appear');
            newFeatures.push('<span style="color: #ff4444;">2 more enemies</span> join the chase');
        } else if (nextLevel === 3) {
            newFeatures.push('<span style="color: #4488ff;">Water tiles</span> - don\'t drown!');
            newFeatures.push('<span style="color: #ff8800;">Power orb</span> - catch your enemies!');
        } else if (nextLevel === 8) {
            newFeatures.push('<span style="color: #ff4400;">Lava tiles</span> - deadly and deceptive!');
        }

        if (newFeatures.length > 0) {
            completionMessage += `<br><br><span style="font-size: 14px; color: #aaa;">Next level introduces:</span><br>`;
            completionMessage += `<span style="font-size: 14px;">${newFeatures.join('<br>')}</span>`;
        }

        winnerText.innerHTML = completionMessage;
        winMessage.style.borderColor = '#00ff88';
        winMessage.style.color = '#00ff88';
        button.textContent = `Next Round (${state.totalGems + 2} gems)`;
        button.onclick = () => startNextRound();
    } else {
        let deathMessage;
        if (reason === 'drowned') {
            deathMessage = `Drowned on round ${state.round} with ${state.gemsCollected}/${state.totalGems} gems.`;
            winMessage.style.borderColor = '#4488ff';
            winMessage.style.color = '#4488ff';
        } else if (reason === 'burned') {
            deathMessage = `Burned in lava on round ${state.round} with ${state.gemsCollected}/${state.totalGems} gems.`;
            winMessage.style.borderColor = '#ff4400';
            winMessage.style.color = '#ff4400';
        } else {
            deathMessage = `Caught on round ${state.round} with ${state.gemsCollected}/${state.totalGems} gems.`;
            winMessage.style.borderColor = '#ff4444';
            winMessage.style.color = '#ff4444';
        }
        winnerText.innerHTML = `Game Over!<br><span style="font-size: 18px;">${deathMessage}</span>`;
        button.textContent = 'Play Again';
        button.onclick = () => location.reload();
    }

    winMessage.style.display = 'block';

    // Show appropriate button under instructions
    const nextLevelBtn = document.getElementById('next-level-btn');
    const restartBtn = document.getElementById('restart-btn');

    if (playerWins) {
        nextLevelBtn.style.display = 'block';
        nextLevelBtn.onclick = () => startNextRound();
        restartBtn.style.display = 'none';
    } else {
        nextLevelBtn.style.display = 'none';
        restartBtn.style.display = 'block';
    }

    // Reset tile highlights
    state.tiles.forEach(tile => {
        tile.material.color.copy(tile.userData.originalColor);
        tile.material.emissive = new THREE.Color(0x000000);
    });
}

// Start next round with more gems
function startNextRound() {
    // Hide the UI buttons
    document.getElementById('next-level-btn').style.display = 'none';
    document.getElementById('restart-btn').style.display = 'none';
    document.getElementById('win-message').style.display = 'none';

    // Jump to the next level (handles planet regeneration and all setup)
    jumpToLevel(state.round + 1);
}

// Update gem display
function updateGemDisplay() {
    const indicator = document.getElementById('turn-indicator');
    let displayText = `<span style="color: #88aaff;">Round ${state.round}</span> | <span style="color: #aaaaaa;">${state.tiles.length} tiles</span> | <span style="color: #ff4466;">Gems: ${state.gemsCollected}/${state.totalGems}</span> | <span style="color: #ffaa00;">Enemy: ${getClosestEnemyDistance()}</span>`;

    // Show orb power status if active
    if (state.orbActive) {
        displayText += ` | <span style="color: #ff8800;">Power: ${state.orbMovesRemaining}</span>`;
    }

    indicator.innerHTML = displayText;
}

// Get closest enemy distance
function getClosestEnemyDistance() {
    let closestDistance = Infinity;

    for (const enemyTile of state.enemyTiles) {
        // Skip inactive enemies
        if (enemyTile < 0) continue;
        // Enemies can walk on water, so distance calculation should not avoid water
        const path = findPath(state.playerTile, enemyTile, false);
        if (path && path.length - 1 < closestDistance) {
            closestDistance = path.length - 1;
        }
    }

    return closestDistance === Infinity ? '?' : closestDistance;
}

// Mouse click handler
// Handle right-click for movement
function onRightClick(event) {
    event.preventDefault(); // Prevent context menu
    handleMoveClick(event.clientX, event.clientY);
}

// Handle shift+click for movement
function onShiftClick(event) {
    if (event.shiftKey) {
        handleMoveClick(event.clientX, event.clientY);
    }
}

// Touch handling for mobile - detect double taps vs drags
let touchStartPos = null;
let touchStartTime = 0;
let lastTapTime = 0;
let lastTapPos = null;

function onTouchStart(event) {
    if (event.touches.length === 1) {
        touchStartPos = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        touchStartTime = Date.now();
    }
}

function onTouchEnd(event) {
    if (!touchStartPos) return;

    // Check if it was a tap (short duration, minimal movement)
    const touchEndTime = Date.now();
    const duration = touchEndTime - touchStartTime;

    // Use changedTouches for the end position
    if (event.changedTouches.length === 1) {
        const endX = event.changedTouches[0].clientX;
        const endY = event.changedTouches[0].clientY;
        const dx = endX - touchStartPos.x;
        const dy = endY - touchStartPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If short tap with minimal movement, check for double tap
        if (duration < 300 && distance < 20) {
            const timeSinceLastTap = touchEndTime - lastTapTime;

            // Check if this is a double tap (second tap within 400ms and near first tap)
            if (lastTapPos && timeSinceLastTap < 400) {
                const doubleTapDx = endX - lastTapPos.x;
                const doubleTapDy = endY - lastTapPos.y;
                const doubleTapDistance = Math.sqrt(doubleTapDx * doubleTapDx + doubleTapDy * doubleTapDy);

                if (doubleTapDistance < 50) {
                    // Double tap detected - trigger move
                    handleMoveClick(endX, endY);
                    lastTapTime = 0;
                    lastTapPos = null;
                    touchStartPos = null;
                    return;
                }
            }

            // Record this tap for potential double tap detection
            lastTapTime = touchEndTime;
            lastTapPos = { x: endX, y: endY };
        }
    }

    touchStartPos = null;
}

// Common handler for move clicks (right-click, shift+click, or tap)
function handleMoveClick(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(state.tiles);

    if (intersects.length > 0) {
        onTileClick(intersects[0].object);
    }
}

// Calculate world-space movement direction from screen-space key angle
function getWorldDirectionFromKey(key) {
    const currentTile = state.tiles[state.playerTile];
    const currentPos = currentTile.userData.center.clone();
    const normal = currentPos.clone().normalize();

    // Key angles in screen space (radians, Y is up)
    // 6 keys arranged in hexagon pattern (60° apart) with S as center
    const keyAngles = {
        'w': Math.PI / 2,          // up (90°)
        'e': Math.PI / 6,          // upper-right (30°)
        'd': -Math.PI / 6,         // lower-right (-30°)
        'x': -Math.PI / 2,         // down (-90°)
        'z': -5 * Math.PI / 6,     // lower-left (-150°)
        'a': 5 * Math.PI / 6       // upper-left (150°)
    };

    const screenAngle = keyAngles[key];
    if (screenAngle === undefined) return null;

    // Get camera's right and up vectors in world space
    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    camera.getWorldDirection(new THREE.Vector3());
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    // Create screen-space direction
    const screenDir = new THREE.Vector3()
        .addScaledVector(cameraRight, Math.cos(screenAngle))
        .addScaledVector(cameraUp, Math.sin(screenAngle));

    // Project onto tangent plane of the sphere at player position
    const tangentDir = screenDir.clone()
        .sub(normal.clone().multiplyScalar(screenDir.dot(normal)))
        .normalize();

    return tangentDir;
}

// Find best neighbor in a given world-space direction
function getNeighborInWorldDirection(worldDir) {
    const currentTile = state.tiles[state.playerTile];
    const neighbors = currentTile.userData.neighbors;
    const currentPos = currentTile.userData.center.clone();

    let bestNeighbor = null;
    let bestDot = -Infinity;

    for (const neighborIdx of neighbors) {
        const neighborTile = state.tiles[neighborIdx];
        const neighborPos = neighborTile.userData.center.clone();

        // Direction from current to neighbor
        const toNeighbor = neighborPos.clone().sub(currentPos).normalize();

        // How well does this match our desired direction?
        const dot = toNeighbor.dot(worldDir);

        if (dot > bestDot) {
            bestDot = dot;
            bestNeighbor = neighborIdx;
        }
    }

    // Only return if reasonably aligned (within ~60 degrees)
    if (bestDot > 0.5) {
        return bestNeighbor;
    }
    return null;
}

// Move player using keyboard - locks direction on first press
function moveByDirection(key) {
    if (state.gameOver) return;

    // If this is a new key or no direction locked, calculate and lock the direction
    if (state.heldKey !== key || !state.lockedMoveDirection) {
        state.heldKey = key;
        state.lockedMoveDirection = getWorldDirectionFromKey(key);
    }

    if (!state.lockedMoveDirection) return;

    // Find neighbor in the locked world direction
    const neighborIdx = getNeighborInWorldDirection(state.lockedMoveDirection);

    if (neighborIdx !== null) {
        onTileClick(state.tiles[neighborIdx]);

        // Update locked direction to continue in same world direction from new position
        // This keeps movement consistent as we traverse the sphere
        const currentTile = state.tiles[state.playerTile];
        const normal = currentTile.userData.center.clone().normalize();

        // Re-project locked direction onto new tangent plane
        state.lockedMoveDirection = state.lockedMoveDirection.clone()
            .sub(normal.clone().multiplyScalar(state.lockedMoveDirection.dot(normal)))
            .normalize();
    }
}

// Keyboard handler
function onKeyDown(event) {
    const key = event.key.toLowerCase();

    if (['w', 'e', 'd', 'x', 'z', 'a'].includes(key)) {
        event.preventDefault();
        moveByDirection(key);
    }

    // Testing mode: number keys 1-9 jump to that level
    if (event.key >= '1' && event.key <= '9') {
        const level = parseInt(event.key);
        jumpToLevel(level);
    }
}

// Jump to a specific level (for testing)
function jumpToLevel(level) {
    // Hide win message if shown
    document.getElementById('win-message').style.display = 'none';

    // Set round and calculate gems
    // Level 1: 1 gem (tutorial), Level 2+: 5, 7, 9, etc.
    state.round = level;
    state.totalGems = level === 1 ? 1 : 5 + (level - 2) * 2;
    state.gemsCollected = 0;
    state.gameOver = false;
    state.moveCount = 0;
    state.heldKey = null;
    state.lockedMoveDirection = null;
    state.pathQueue = [];
    state.isAutoMoving = false;

    // Regenerate planet for this level (10% larger each level)
    const params = regeneratePlanet(level);

    const numTiles = state.tiles.length;

    // Helper to find nearest valid tile (not blocked, not water, not excluded, optionally must be hexagon)
    const findValidTile = (startIndex, excludeTiles = new Set(), mustBeHexagon = false) => {
        const isValid = (idx) => {
            if (state.blockedTiles.has(idx) || state.waterTiles.has(idx) || state.lavaTiles.has(idx) || excludeTiles.has(idx)) return false;
            if (mustBeHexagon && state.tiles[idx].userData.isPentagon) return false;
            return true;
        };
        if (isValid(startIndex)) return startIndex;
        const visited = new Set([startIndex]);
        const queue = [startIndex];
        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = state.tiles[current].userData.neighbors;
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    if (isValid(neighbor)) {
                        return neighbor;
                    }
                    queue.push(neighbor);
                }
            }
        }
        return startIndex;
    };

    // Set up two portal tiles
    state.portalTiles = [
        findValidTile(Math.floor(numTiles / 6)),
        findValidTile(Math.floor(numTiles * 5 / 6))
    ];

    // Style portal tiles with glowing green auras
    state.portalTiles.forEach(portalIndex => {
        const portalTile = state.tiles[portalIndex];
        const tileCenter = portalTile.userData.center.clone();
        const normal = tileCenter.clone().normalize();

        portalTile.material.color.set(0x00ff44);
        portalTile.material.emissive = new THREE.Color(0x00aa22);
        portalTile.material.emissiveIntensity = 1;

        // Create portal effect group
        const portalEffect = new THREE.Group();

        // Outer glow ring
        const outerRingGeom = new THREE.TorusGeometry(1.2, 0.08, 16, 32);
        const outerRingMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.8 });
        const outerRing = new THREE.Mesh(outerRingGeom, outerRingMat);
        portalEffect.add(outerRing);

        // Inner glow ring
        const innerRingGeom = new THREE.TorusGeometry(0.8, 0.06, 16, 32);
        const innerRingMat = new THREE.MeshBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.9 });
        const innerRing = new THREE.Mesh(innerRingGeom, innerRingMat);
        portalEffect.add(innerRing);

        // Glowing disc
        const discGeom = new THREE.CircleGeometry(0.7, 32);
        const discMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
        const disc = new THREE.Mesh(discGeom, discMat);
        portalEffect.add(disc);

        // Vertical beam
        const beamGeom = new THREE.CylinderGeometry(0.3, 0.5, 3, 16, 1, true);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
        const beam = new THREE.Mesh(beamGeom, beamMat);
        beam.position.y = 1.5;
        portalEffect.add(beam);

        // Position portal effect
        portalEffect.position.copy(tileCenter);
        portalEffect.lookAt(tileCenter.clone().add(normal));
        portalEffect.rotateX(Math.PI / 2);
        portalEffect.position.add(normal.clone().multiplyScalar(0.2));

        scene.add(portalEffect);
        state.portalEffects.push(portalEffect);
    });

    // Reset player position (must be a hexagon, not a pentagon)
    state.playerTile = findValidTile(0, new Set(), true);
    positionPlayerOnTile(state.playerMesh, state.tiles[state.playerTile], true, true);

    // Reset enemy positions
    // Level 1: 1 enemy, Level 2+: 3 enemies
    const numEnemies = level === 1 ? 1 : 3;
    const usedTiles = new Set([state.playerTile, ...state.portalTiles, ...state.blockedTiles]);
    const enemyStartPositions = [
        Math.floor(numTiles / 3),
        Math.floor(numTiles / 2),
        Math.floor(numTiles * 2 / 3)
    ];
    for (let i = 0; i < state.enemyMeshes.length; i++) {
        if (i < numEnemies) {
            // Active enemy - position and show
            state.enemyTiles[i] = findValidTile(enemyStartPositions[i], usedTiles);
            usedTiles.add(state.enemyTiles[i]);
            positionPlayerOnTile(state.enemyMeshes[i], state.tiles[state.enemyTiles[i]]);
            state.enemyMeshes[i].visible = true;
        } else {
            // Inactive enemy - hide
            state.enemyTiles[i] = -1; // Mark as inactive
            state.enemyMeshes[i].visible = false;
        }
    }

    // Place gems (not on water tiles)
    usedTiles.add(state.playerTile);
    state.enemyTiles.forEach(t => usedTiles.add(t));

    while (state.gemTiles.length < state.totalGems) {
        const randomTile = Math.floor(Math.random() * numTiles);
        // Don't place gems on used tiles or water tiles
        if (!usedTiles.has(randomTile) && !state.waterTiles.has(randomTile)) {
            state.gemTiles.push(randomTile);
            usedTiles.add(randomTile);

            const gemMesh = createGem(state.tiles[randomTile]);
            state.gemMeshes.push(gemMesh);
            scene.add(gemMesh);
        }
    }

    // Place power orb on level 3+ (allows player to catch enemies for 10 moves)
    if (level >= 3) {
        let orbPlaced = false;
        let attempts = 0;
        while (!orbPlaced && attempts < 100) {
            const randomTile = Math.floor(Math.random() * numTiles);
            if (!usedTiles.has(randomTile) && !state.waterTiles.has(randomTile)) {
                state.orbTile = randomTile;
                usedTiles.add(randomTile);
                state.orbMesh = createPowerOrb(state.tiles[randomTile]);
                scene.add(state.orbMesh);
                orbPlaced = true;
            }
            attempts++;
        }
    }

    // Reset camera to view player (rotate around planet center at 0,0,0)
    // Keep camera at a fixed distance above the planet surface (not scaling with planet size)
    const cameraHeightAboveSurface = 30; // Constant distance above planet surface
    const cameraDistance = params.radius + cameraHeightAboveSurface;
    const playerDirection = state.playerMesh.position.clone().normalize();
    const cameraPos = playerDirection.clone().multiplyScalar(cameraDistance);
    camera.position.copy(cameraPos);
    state.cameraTargetPosition.copy(cameraPos);
    controls.target.set(0, 0, 0); // Always rotate around planet center
    controls.maxDistance = params.radius + 60; // Fixed distance above surface for max zoom
    controls.minDistance = params.radius + 5; // Don't go inside planet
    controls.update();

    // Update display
    highlightValidMoves(state.playerTile);
    updateGemDisplay();

    // Start intro animation on level 1
    if (level === 1) {
        startIntroAnimation(params.radius, cameraDistance);
    }

    console.log(`Jumped to level ${level} (${state.totalGems} gems, ${numTiles} hexagons)`);
}

// Start the intro animation - player drops in from space
function startIntroAnimation(planetRadius, finalCameraDistance) {
    state.introPlaying = true;
    state.introStartTime = Date.now();

    // Hide player initially, enemies too
    state.playerMesh.visible = false;
    state.enemyMeshes.forEach(e => e.visible = false);

    // Calculate player's final position on planet
    state.playerIntroEnd.copy(state.playerMesh.position);

    // Player starts high above the planet
    const playerNormal = state.playerIntroEnd.clone().normalize();
    state.playerIntroStart.copy(playerNormal.clone().multiplyScalar(planetRadius + 80));

    // Camera starts far out in space, looking at planet
    const cameraStartDistance = planetRadius + 120;
    state.introStartPos.copy(playerNormal.clone().multiplyScalar(cameraStartDistance));
    // Offset camera slightly to the side for a more dramatic angle
    const sideOffset = new THREE.Vector3(1, 0.5, 0).normalize().multiplyScalar(40);
    state.introStartPos.add(sideOffset);

    // Camera ends at normal gameplay position
    state.introEndPos.copy(playerNormal.clone().multiplyScalar(finalCameraDistance));

    // Set initial camera position
    camera.position.copy(state.introStartPos);
    controls.target.set(0, 0, 0);
    controls.enabled = false; // Disable controls during intro
    controls.update();
}

// Keyboard release handler - clears locked direction
function onKeyUp(event) {
    const key = event.key.toLowerCase();

    if (key === state.heldKey) {
        state.heldKey = null;
        state.lockedMoveDirection = null;
    }
}

// Window resize handler
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Start the game from splash screen
function startGame() {
    if (state.splashDismissed) return;

    state.splashDismissed = true;

    // Hide splash screen with fade out
    const splash = document.getElementById('splash-screen');
    splash.style.transition = 'opacity 0.5s ease-out';
    splash.style.opacity = '0';
    setTimeout(() => {
        splash.classList.add('hidden');
    }, 500);

    // Show the game UI
    document.getElementById('ui').style.display = 'block';

    // Start level 1
    jumpToLevel(1);
}

// Initialize game
function init() {
    // Hide UI until game starts
    document.getElementById('ui').style.display = 'none';

    // Create player marker (green) - hidden until game starts
    state.playerMesh = createPlayerMarker(0x44ff44, 0x00ff00);
    state.playerMesh.visible = false;
    scene.add(state.playerMesh);

    // Create 3 enemy markers (red) - will be shown/hidden based on level
    state.enemyTiles = [0, 0, 0]; // Placeholder positions
    for (let i = 0; i < 3; i++) {
        const enemy = createPlayerMarker(0xff4444, 0xff0000);
        enemy.visible = false;
        state.enemyMeshes.push(enemy);
        scene.add(enemy);
    }

    // Set up splash screen event listeners
    const startBtn = document.getElementById('start-btn');
    const splash = document.getElementById('splash-screen');

    startBtn.addEventListener('click', startGame);
    splash.addEventListener('click', startGame);
    window.addEventListener('keydown', (e) => {
        if (!state.splashDismissed && (e.key === 'Enter' || e.key === ' ')) {
            startGame();
        }
    });

    // Event listeners for gameplay
    window.addEventListener('contextmenu', onRightClick);  // Right-click to move
    window.addEventListener('click', onShiftClick);        // Shift+click to move
    window.addEventListener('touchstart', onTouchStart, { passive: true });  // Touch for mobile
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    // Mobile help toggle button
    const toggleBtn = document.getElementById('toggle-instructions');
    const instructions = document.getElementById('instructions');
    if (toggleBtn && instructions) {
        toggleBtn.addEventListener('click', () => {
            instructions.classList.toggle('show');
            toggleBtn.textContent = instructions.classList.contains('show') ? '✕ Close' : '? Help';
        });
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    const time = Date.now() * 0.001;

    // Intro animation - player drops in from space
    if (state.introPlaying) {
        const elapsed = Date.now() - state.introStartTime;
        const progress = Math.min(elapsed / state.introDuration, 1);

        // Easing function for smooth animation (ease-out cubic)
        const eased = 1 - Math.pow(1 - progress, 3);

        // Animate camera from space to gameplay position
        camera.position.lerpVectors(state.introStartPos, state.introEndPos, eased);
        controls.update();

        // Show player at 30% progress and animate drop
        if (progress > 0.3) {
            state.playerMesh.visible = true;
            const playerProgress = (progress - 0.3) / 0.7; // 0 to 1 over remaining 70%
            const playerEased = 1 - Math.pow(1 - playerProgress, 2); // ease-out quad

            // Interpolate player position from space to planet surface
            const currentPlayerPos = new THREE.Vector3().lerpVectors(
                state.playerIntroStart,
                state.playerIntroEnd,
                playerEased
            );
            state.playerMesh.position.copy(currentPlayerPos);

            // Keep player oriented to planet surface
            const normal = currentPlayerPos.clone().normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const quaternion = new THREE.Quaternion();
            quaternion.setFromUnitVectors(up, normal);
            state.playerMesh.quaternion.copy(quaternion);
        }

        // Animation complete
        if (progress >= 1) {
            state.introPlaying = false;
            controls.enabled = true;

            // Show enemies
            for (let i = 0; i < state.enemyMeshes.length; i++) {
                if (state.enemyTiles[i] >= 0) {
                    state.enemyMeshes[i].visible = true;
                }
            }

            // Ensure player is at final position
            state.playerMesh.position.copy(state.playerIntroEnd);
            positionPlayerOnTile(state.playerMesh, state.tiles[state.playerTile], false, true);

            // Update key labels now that intro is done
            updateKeyLabels(state.playerTile);
        }
    }

    // Smooth camera tracking - follows player while rotating around planet center
    if (state.cameraIsTracking && !state.introPlaying) {
        const lerpFactor = 0.06; // Smooth transition speed

        // Smoothly interpolate camera position
        camera.position.lerp(state.cameraTargetPosition, lerpFactor);

        // Check if we're close enough to stop tracking
        const positionDist = camera.position.distanceTo(state.cameraTargetPosition);
        if (positionDist < 0.05) {
            state.cameraIsTracking = false;
        }

        controls.update();

        // Update key labels as camera moves
        if (state.playerTile !== null && !state.gameOver) {
            updateKeyLabels(state.playerTile);
        }
    }

    // Subtle player/enemy animation (spinning rings)
    if (state.playerMesh) {
        state.playerMesh.children[2].rotation.z = time * 2;
    }
    for (const enemy of state.enemyMeshes) {
        enemy.children[2].rotation.z = -time * 2;
    }

    // Animate power orb
    if (state.orbMesh) {
        // Rotate the orbiting rings
        state.orbMesh.children[3].rotation.z = time * 1.5;
        state.orbMesh.children[3].rotation.x = time * 0.5;
        state.orbMesh.children[4].rotation.y = time * 1.2;
        state.orbMesh.children[4].rotation.z = time * 0.3;
        // Pulse the aura
        state.orbMesh.children[2].scale.setScalar(1 + Math.sin(time * 2) * 0.2);
        state.orbMesh.children[2].material.opacity = 0.15 + Math.sin(time * 3) * 0.1;
        // Bobbing motion
        const bobOffset = Math.sin(time * 2) * 0.1;
        state.orbMesh.children[0].position.y = bobOffset;
        state.orbMesh.children[1].position.y = bobOffset;
    }

    // Animate gems (rotation and bobbing)
    state.gemMeshes.forEach((gem, index) => {
        // Rotate the gem
        gem.children[0].rotation.y = time * 2;
        gem.children[1].rotation.y = time * 2;
        // Pulse the aura
        if (gem.children[2]) {
            gem.children[2].scale.setScalar(1 + Math.sin(time * 3 + index) * 0.15);
            gem.children[2].material.opacity = 0.2 + Math.sin(time * 2 + index) * 0.1;
        }
        // Rotate the base ring
        if (gem.children[3]) {
            gem.children[3].rotation.z = time;
        }
    });

    // Animate portal effects
    state.portalEffects.forEach((portalEffect, index) => {
        // Rotate outer ring
        if (portalEffect.children[0]) {
            portalEffect.children[0].rotation.z = time * 0.5;
        }
        // Rotate inner ring opposite direction
        if (portalEffect.children[1]) {
            portalEffect.children[1].rotation.z = -time * 0.8;
        }
        // Pulse the central disc
        if (portalEffect.children[2]) {
            const pulse = 0.4 + Math.sin(time * 3) * 0.15;
            portalEffect.children[2].material.opacity = pulse;
        }
        // Pulse beam opacity
        if (portalEffect.children[3]) {
            const beamPulse = 0.2 + Math.sin(time * 2 + index) * 0.1;
            portalEffect.children[3].material.opacity = beamPulse;
        }
        // Animate floating rings
        for (let i = 4; i < portalEffect.children.length; i++) {
            const ring = portalEffect.children[i];
            if (ring.userData.floatOffset !== undefined) {
                ring.position.y = 0.5 + (i - 4) * 0.6 + Math.sin(time * ring.userData.floatSpeed + ring.userData.floatOffset) * 0.2;
                ring.rotation.z = time * (i % 2 === 0 ? 1 : -1);
            }
        }
    });

    controls.update();
    renderer.render(scene, camera);
}

// Start the game
init();
animate();
