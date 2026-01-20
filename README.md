# Vibe Star Chase

A 3D arcade-style pursuit game on a procedurally-generated hexagonal planet. Collect glowing gems while evading enemy chasers across the surface of a Death Star-inspired world floating in space.

**[Play Now](https://frasermarlow.github.io/vibe-star-chase/)**

## Overview

Navigate a geodesic hexagonal planet, collecting yellow gems while avoiding red enemy pursuers. Use portals for quick escapes, grab power orbs to turn the tables on your hunters, and watch out for water and lava hazards as you progress through increasingly challenging rounds.

## Features

- **Hexagonal Planet** - Explore a geodesic sphere divided into hexagons and pentagons
- **Gem Collection** - Gather glowing yellow gems scattered across the planet surface
- **Enemy AI** - Intelligent pursuers use pathfinding to hunt you down
- **Power Orbs** - Collect to gain 2x speed and make enemies flee (Level 3+)
- **Portal System** - Two linked portals for instant teleportation
- **Environmental Hazards** - Water (Level 3+) and lava (Level 8+) tiles spell instant death
- **Progressive Difficulty** - Larger planets, more gems, and new hazards as you advance
- **Cross-Platform** - Full support for desktop and mobile devices
- **Direction Guide** - Highlighted key or arrow pointing toward nearest gem

## How to Play

### Objective
Collect all gems on the planet to complete each round. Avoid enemies and hazards.

### Win Condition
Gather every gem on the current level to advance to the next round.

### Lose Conditions
- **Caught** - An enemy reaches your tile or an adjacent tile
- **Drowned** - Step onto a water tile (blue)
- **Burned** - Step onto a lava tile (red/orange)

## Controls

### Desktop

| Input | Action |
|-------|--------|
| **W, E, D, X, Z, A** | Move in 6 hexagonal directions |
| **Right-Click** | Move to tile / Auto-path to distant tile |
| **Shift + Click** | Alternative movement |
| **Mouse Drag** | Rotate camera |
| **Scroll** | Zoom in/out |

The keyboard layout maps to hexagonal directions:
```
    W       (up)
  A   E     (upper-left, upper-right)
  Z   D     (lower-left, lower-right)
    X       (down)
```

### Mobile / Touch

| Input | Action |
|-------|--------|
| **Double-Tap** | Move to tile / Auto-path |
| **Drag** | Rotate camera |
| **? Button** | Toggle help popup |

A golden arrow near the player points toward the nearest gem.

## Game Elements

### Player (Green)
Your character - a glowing green figure with a spinning ring. Navigate carefully to collect gems while avoiding enemies.

### Enemies (Red)
AI-controlled pursuers that chase you using pathfinding. They can walk on water (you cannot). When a power orb is active, they turn blue and flee instead.

### Gems (Yellow/Gold)
Glowing octahedrons scattered across the planet. Collect all of them to win the round. A highlighted keyboard key or arrow shows the direction to the nearest gem.

### Power Orb (Orange) - Level 3+
Grants "2x Speed" for 10 enemy turns:
- You get 2 moves per enemy move
- Enemies become vulnerable (blue) and flee
- Touch fleeing enemies to eliminate them temporarily

### Portals (Green Glow)
Two linked teleporters per level. Step on one to instantly travel to the other.

### Blocked Tiles (Dark Gray)
Tall impassable obstacles. Neither you nor enemies can traverse these.

### Water Tiles (Blue) - Level 3+
Deadly to the player but safe for enemies. Auto-pathing avoids water.

### Lava Tiles (Red/Orange) - Level 8+
Deadly to everyone. Glowing pools of molten rock.

## Progression

| Level | Enemies | Gems | New Features |
|-------|---------|------|--------------|
| 1 | 1 | 1 | Tutorial round |
| 2 | 3 | 5 | Random obstacles |
| 3 | 3 | 7 | Water hazards, Power orb |
| 4+ | 3 | 9+ | Larger planets |
| 8+ | 3 | 15+ | Lava hazards |

The planet grows larger with each level:
- **Levels 1-3:** 642 tiles
- **Levels 4-6:** 2,562 tiles
- **Levels 7+:** 10,242 tiles

## Technical Details

### Built With
- **[Three.js](https://threejs.org/)** (v0.160.0) - 3D graphics engine
- **ES Modules** - Modern JavaScript module system
- **Canvas API** - Dynamic texture generation for UI elements

### Geodesic Sphere Generation
The planet uses a subdivided icosahedron algorithm:
- 12 pentagon tiles at icosahedron vertices
- All other tiles are hexagons
- Dual mesh construction creates proper hex/pentagon grid
- Formula: `10 × 4^n + 2` tiles per subdivision level

### Pathfinding
- BFS (Breadth-First Search) for shortest paths
- Enemies use pathfinding to chase or flee
- Auto-pathing avoids water for player safety

### Rendering
- WebGL with antialiasing
- Dynamic starfield (2,000 particles)
- Animated effects: spinning rings, pulsing auras, bobbing motion
- Responsive design for all screen sizes

## Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/frasermarlow/vibe-star-chase.git
   cd vibe-star-chase
   ```

2. Serve the files locally (required for ES modules):
   ```bash
   # Using Python
   python -m http.server 8000

   # Using Node.js
   npx serve
   ```

3. Open `http://localhost:8000` in your browser

### Project Structure
```
vibe-star-chase/
├── index.html      # Game HTML, CSS, and UI
├── game.js         # Game logic and Three.js rendering
├── sound1.m4a      # Gem collection sound effect
└── README.md       # This file
```

## Version History

- **v0.9** - Gem direction indicator (highlighted key / mobile arrow)
- **v0.8** - Power orb grants 2x speed (2 moves per enemy turn)
- **v0.7** - Redesigned gems with yellow/gold glow
- **v0.6** - Gems avoid spawning on water, lava, blocked tiles
- **v0.5** - Mobile help popup and splash screen
- **v0.4** - Camera tracking improvements

## Credits

Created with assistance from Claude (Anthropic).

## License

MIT License - Feel free to use, modify, and distribute.
