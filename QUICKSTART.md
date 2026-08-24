# Vanguard Duel — Quick Start

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open in browser:**
   - Open `http://localhost:3000` in two browser tabs (or two different devices on the same WiFi)
   - The first two connections will be auto-paired into a game

## Play Over Network

To play with someone on your home network:

1. Find your machine's LAN IP: `ipconfig` (Windows) or `ip addr` (Mac/Linux)
2. They open `http://<YOUR_LAN_IP>:3000`
3. You open `http://localhost:3000`

## Features

✨ **New Master Duel-Inspired UI:**
- Cinematic "STAND UP, MY VANGUARD" intro
- Beautiful dark theme with gold/cyan accents
- Click any card to see full details
- Horizontal attack animations
- Smooth animations and effects

🎮 **Full Gameplay:**
- Complete turn structure (Stand → Draw → Ride → Main → Battle → End)
- Mulligan at start
- Calling rearguards & boosting
- Twin Drive at grade 3+
- Intercept from front row
- Trigger resolution (Critical, Draw, Front, Heal)
- Drive checks & damage checks
- Real rules enforcement by server

## Files

- `server.js` - Express + WebSocket server
- `gameEngine.js` - Core rules engine
- `cards.js` - Card pool & decks
- `index.html` - New UI structure
- `style.css` - Master Duel-inspired styling
- `client.js` - Enhanced client with card details & animations
- `package.json` - Dependencies

Enjoy! 🎮
