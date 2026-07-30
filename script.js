import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDghzmm1njN43LyBcBUqpL7g0FowgX4YNS",
  authDomain: "blackjack-13715.firebaseapp.com",
  databaseURL: "https://blackjack-13715-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "blackjack-13715",
  storageBucket: "blackjack-13715.firebasestorage.app",
  messagingSenderId: "655073109580",
  appId: "1:655073109580:web:1d3900505b36075b7bb6e9"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// --- DOM : LOBBY ---
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const lobbyName = document.getElementById('lobby-name');
const lobbyCode = document.getElementById('lobby-code');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const lobbyError = document.getElementById('lobby-error');
const displayRoomCode = document.getElementById('display-room-code');

// --- DOM : JEU ---
const elPlayersContainer = document.getElementById('players-container');
const elDealerCards = document.getElementById('dealer-cards');
const elDealerScore = document.getElementById('dealer-score');
const elGameMessage = document.getElementById('game-message');

const btnStart = document.getElementById('btn-start');
const actionButtons = document.getElementById('action-buttons');
const btnHit = document.getElementById('btn-hit');
const btnStand = document.getElementById('btn-stand');
const bettingControls = document.getElementById('betting-controls');
const betInput = document.getElementById('bet-input');
const btnBet = document.getElementById('btn-bet');

// Variables de Session
let roomCode = "";
let playerName = "";
let isHost = false;
let myPlayerId = 'p_' + Math.random().toString(36).substr(2, 9);
let gameState = null;
let isDealing = false; 

// ==========================================
// 1. GESTION DU LOBBY
// ==========================================
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

btnCreateRoom.addEventListener('click', async () => {
  playerName = lobbyName.value.trim() || "Joueur";
  const maxPlayers = parseInt(document.getElementById('lobby-num-players').value) || 2;
  roomCode = generateRoomCode();
  isHost = true;
  
  try {
    await set(ref(db, 'rooms/' + roomCode), {
      phase: 'waiting',
      host: playerName,
      maxPlayers: maxPlayers,
      turnOrder: [myPlayerId],
      activeTurnIndex: 0,
      players: {
        [myPlayerId]: { name: playerName, chips: 1000, bet: 0, status: 'active' }
      }
    });
    enterGameRoom();
  } catch (error) {
    console.error(error);
    lobbyError.textContent = "Erreur de création du salon.";
    lobbyError.classList.remove('hidden');
  }
});

btnJoinRoom.addEventListener('click', async () => {
  playerName = lobbyName.value.trim() || "Joueur";
  roomCode = lobbyCode.value.trim().toUpperCase();
  
  if (roomCode.length === 0) {
    lobbyError.textContent = "Veuillez entrer un code de salon.";
    lobbyError.classList.remove('hidden');
    return;
  }
  
  try {
    const snapshot = await get(ref(db, 'rooms/' + roomCode));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const currentPlayersCount = data.turnOrder ? data.turnOrder.length : 0;
      
      if (data.phase !== 'waiting') {
        lobbyError.textContent = "La partie a déjà commencé.";
        lobbyError.classList.remove('hidden');
        return;
      }
      if (currentPlayersCount >= data.maxPlayers) {
        lobbyError.textContent = "Le salon est plein.";
        lobbyError.classList.remove('hidden');
        return;
      }

      let newTurnOrder = data.turnOrder || [];
      newTurnOrder.push(myPlayerId);

      await update(ref(db, 'rooms/' + roomCode), {
        [`players/${myPlayerId}`]: { name: playerName, chips: 1000, bet: 0, status: 'active' },
        turnOrder: newTurnOrder
      });

      isHost = false;
      enterGameRoom();
    } else {
      lobbyError.textContent = "Ce code n'existe pas.";
      lobbyError.classList.remove('hidden');
    }
  } catch (error) {
    console.error(error);
    lobbyError.textContent = "Erreur Firebase.";
    lobbyError.classList.remove('hidden');
  }
});

function enterGameRoom() {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  displayRoomCode.textContent = roomCode;
  
  // ÉCOUTEUR PRINCIPAL EN TEMPS RÉEL
  onValue(ref(db, 'rooms/' + roomCode), (snapshot) => {
    gameState = snapshot.val();
    if (!gameState) return;

    updateUI();
    checkPhase();
  });
}

// ==========================================
// 2. SYNCHRONISATION VISUELLE (INTERFACE)
// ==========================================
function updateUI() {
  if (!gameState || !gameState.turnOrder) return;

  // Création des zones joueurs si manquantes
  if (elPlayersContainer.children.length !== gameState.turnOrder.length) {
    elPlayersContainer.innerHTML = '';
    gameState.turnOrder.forEach((pId) => {
      const pZone = document.createElement('div');
      pZone.className = 'player-zone';
      pZone.innerHTML = `
        <div class="cards-container" id="p-${pId}-cards"></div>
        <div class="player-info" id="p-${pId}-info">
          <span class="player-name" id="p-${pId}-name"></span>
          <span class="player-chips">Score: <span id="p-${pId}-score">0</span> | <span id="p-${pId}-chips"></span> €</span>
          <span id="p-${pId}-bet" style="color: #ffd700; font-size: 0.85em;">Mise: 0 €</span>
        </div>
      `;
      elPlayersContainer.appendChild(pZone);
    });
  }

  // Mise à jour du contenu des joueurs
  gameState.turnOrder.forEach((pId, index) => {
    const p = gameState.players[pId];
    document.getElementById(`p-${pId}-name`).textContent = p.name + (pId === myPlayerId ? " (Vous)" : "");
    document.getElementById(`p-${pId}-chips`).textContent = p.chips;
    
    // Affichage des messages de fin ou des mises
    if (gameState.phase === 'resolved' && p.resultMsg) {
      document.getElementById(`p-${pId}-bet`).textContent = p.resultMsg;
    } else {
      document.getElementById(`p-${pId}-bet`).textContent = `Mise: ${p.bet} €`;
    }

    // Mise à jour des cartes
    renderCards(document.getElementById(`p-${pId}-cards`), p.cards || [], false);
    document.getElementById(`p-${pId}-score`).textContent = calculateScore(p.cards || []);

    // Surbrillance du tour actif
    const infoBox = document.getElementById(`p-${pId}-info`);
    if ((gameState.phase === 'betting' || gameState.phase === 'playing') && gameState.activeTurnIndex === index) {
      infoBox.classList.add('active-player-highlight');
    } else {
      infoBox.classList.remove('active-player-highlight');
    }
  });

  // Mise à jour des cartes du Croupier
  const hideDealerSecondCard = (gameState.phase === 'playing');
  renderCards(elDealerCards, gameState.dealerCards || [], hideDealerSecondCard);
  
  if (hideDealerSecondCard && gameState.dealerCards && gameState.dealerCards.length > 0) {
    elDealerScore.textContent = calculateScore([gameState.dealerCards[0]]);
  } else {
    elDealerScore.textContent = calculateScore(gameState.dealerCards || []);
  }
}

// ==========================================
// 3. LOGIQUE DES PHASES (MOTEUR DE JEU)
// ==========================================
async function checkPhase() {
  if (!gameState || !gameState.turnOrder) return;
  
  const activeId = gameState.turnOrder[gameState.activeTurnIndex];
  
  // Cache tout par défaut
  actionButtons.classList.add('hidden');
  bettingControls.classList.add('hidden');
  btnStart.classList.add('hidden');

  if (gameState.phase === 'waiting') {
    const count = gameState.turnOrder.length;
    
    // VERIFICATION DU SALON PLEIN ET MESSAGE D'ATTENTE
    if (count >= gameState.maxPlayers) {
      if (isHost) {
        elGameMessage.textContent = "Tout le monde est là ! Vous pouvez lancer la partie.";
        btnStart.textContent = "Lancer la partie";
        btnStart.classList.remove('hidden');
      } else {
        elGameMessage.textContent = "En attente du lancement de la partie par l'hôte...";
      }
    } else {
      elGameMessage.textContent = `En attente de joueurs... (${count}/${gameState.maxPlayers})`;
    }
  }
  else if (gameState.phase === 'betting') {
    if (activeId === myPlayerId) {
      bettingControls.classList.remove('hidden');
      const maxBet = gameState.players[myPlayerId].chips;
      betInput.max = maxBet;
      betInput.value = Math.min(50, maxBet);
      elGameMessage.textContent = `À vous de miser (Solde: ${maxBet} €)`;
    } else {
      const activeName = gameState.players[activeId].name;
      elGameMessage.textContent = `En attente de la mise de ${activeName}...`;
    }
  }
  else if (gameState.phase === 'dealing') {
    elGameMessage.textContent = "Distribution des cartes...";
    if (isHost && !isDealing) {
      isDealing = true;
      let newDeck = createDeck();
      let updates = {};
      
      gameState.turnOrder.forEach(pId => {
        updates[`players/${pId}/cards`] = [newDeck.pop(), newDeck.pop()];
      });
      
      updates['dealerCards'] = [newDeck.pop(), newDeck.pop()];
      updates['deck'] = newDeck;
      updates['phase'] = 'playing';
      updates['activeTurnIndex'] = 0;
      
      await update(ref(db, 'rooms/' + roomCode), updates);
      isDealing = false;
    }
  }
  else if (gameState.phase === 'playing') {
    const pScore = calculateScore(gameState.players[activeId].cards || []);
    
    if (activeId === myPlayerId) {
      if (pScore < 21) {
        actionButtons.classList.remove('hidden');
        elGameMessage.textContent = "À vous de jouer : Tirer ou Rester ?";
      } else {
        elGameMessage.textContent = "Blackjack / Bust ! Passage au joueur suivant...";
        // Auto-passe au bout d'une seconde si 21+
        if (gameState.players[myPlayerId].status !== 'stand' && gameState.players[myPlayerId].status !== 'bust') {
          setTimeout(endMyTurn, 1000, pScore > 21 ? 'bust' : 'stand');
        }
      }
    } else {
      elGameMessage.textContent = `Au tour de ${gameState.players[activeId].name}...`;
    }
  }
  else if (gameState.phase === 'dealer_turn') {
    elGameMessage.textContent = "Tour du croupier...";
    if (isHost && !isDealing) {
      isDealing = true;
      playDealerTurn();
    }
  }
  else if (gameState.phase === 'resolved') {
    elGameMessage.textContent = "Fin de la main.";
    if (isHost) {
      btnStart.textContent = "Nouvelle main";
      btnStart.classList.remove('hidden');
    }
  }
}

// ==========================================
// 4. ACTIONS DES JOUEURS
// ==========================================
btnStart.addEventListener('click', async () => {
  let updates = { phase: 'betting', activeTurnIndex: 0, deck: [], dealerCards: [] };
  gameState.turnOrder.forEach(pId => {
    updates[`players/${pId}/bet`] = 0;
    updates[`players/${pId}/cards`] = [];
    updates[`players/${pId}/status`] = 'active';
    updates[`players/${pId}/resultMsg`] = null;
  });
  await update(ref(db, 'rooms/' + roomCode), updates);
});

btnBet.addEventListener('click', async () => {
  const bet = parseInt(betInput.value);
  const myData = gameState.players[myPlayerId];
  
  if (bet > myData.chips || bet < 10) return alert("Mise invalide.");
  
  let updates = {};
  updates[`players/${myPlayerId}/bet`] = bet;
  updates[`players/${myPlayerId}/chips`] = myData.chips - bet;
  
  const nextIndex = gameState.activeTurnIndex + 1;
  if (nextIndex >= gameState.turnOrder.length) {
    updates['phase'] = 'dealing';
    updates['activeTurnIndex'] = 0;
  } else {
    updates['activeTurnIndex'] = nextIndex;
  }
  await update(ref(db, 'rooms/' + roomCode), updates);
});

btnHit.addEventListener('click', async () => {
  let deck = gameState.deck || [];
  let myCards = gameState.players[myPlayerId].cards || [];
  
  myCards.push(deck.pop());
  
  await update(ref(db, 'rooms/' + roomCode), {
    'deck': deck,
    [`players/${myPlayerId}/cards`]: myCards
  });
});

btnStand.addEventListener('click', () => {
  endMyTurn('stand');
});

async function endMyTurn(newStatus) {
  let updates = { [`players/${myPlayerId}/status`]: newStatus };
  const nextIndex = gameState.activeTurnIndex + 1;
  
  if (nextIndex >= gameState.turnOrder.length) {
    updates['phase'] = 'dealer_turn';
  } else {
    updates['activeTurnIndex'] = nextIndex;
  }
  await update(ref(db, 'rooms/' + roomCode), updates);
}

// ==========================================
// 5. TOUR DU CROUPIER (Géré par l'Hôte)
// ==========================================
async function playDealerTurn() {
  let currentDeck = gameState.deck || [];
  let dCards = gameState.dealerCards || [];
  let dScore = calculateScore(dCards);
  
  // Tire tant que < 17
  while (dScore < 17 && currentDeck.length > 0) {
    await new Promise(r => setTimeout(r, 1000));
    dCards.push(currentDeck.pop());
    dScore = calculateScore(dCards);
    await update(ref(db, 'rooms/' + roomCode), { dealerCards: dCards, deck: currentDeck });
  }
  
  await new Promise(r => setTimeout(r, 1000)); // Pause finale
  
  let updates = {};
  gameState.turnOrder.forEach(pId => {
    const p = gameState.players[pId];
    const pScore = calculateScore(p.cards || []);
    let winnings = 0;
    let msg = '';
    
    if (p.status === 'bust' || pScore > 21) { msg = 'Buste !'; }
    else if (pScore === 21 && p.cards.length === 2) {
      if (dScore === 21 && dCards.length === 2) {
        winnings = p.bet; msg = 'Égalité (BJ)';
      } else {
        winnings = p.bet * 2.5; msg = 'Blackjack !';
      }
    } else if (dScore > 21 || pScore > dScore) {
      winnings = p.bet * 2; msg = 'Gagné !';
    } else if (pScore === dScore) {
      winnings = p.bet; msg = 'Égalité';
    } else {
      msg = 'Perdu';
    }
    
    updates[`players/${pId}/chips`] = p.chips + winnings;
    updates[`players/${pId}/resultMsg`] = msg;
  });
  
  updates['phase'] = 'resolved';
  await update(ref(db, 'rooms/' + roomCode), updates);
  isDealing = false;
}

// ==========================================
// 6. UTILITAIRES 
// ==========================================
function calculateScore(cards) {
  let score = 0, aces = 0;
  for (let card of cards) {
    if (['J', 'Q', 'K'].includes(card.value)) score += 10;
    else if (card.value === 'A') { score += 11; aces += 1; }
    else score += parseInt(card.value);
  }
  while (score > 21 && aces > 0) { score -= 10; aces -= 1; }
  return score;
}

function createDeck() {
  let newDeck = [];
  for (let suit of SUITS) {
    for (let value of VALUES) {
      newDeck.push({ value, suit, isRed: suit === '♥' || suit === '♦' });
    }
  }
  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
}

function createCardElement(card) {
  const cardEl = document.createElement('div');
  cardEl.classList.add('card', 'deal-animation');
  if(!card) return cardEl; // Sécurité
  
  const backFace = document.createElement('div');
  backFace.classList.add('card-face', 'card-back');
  
  const frontFace = document.createElement('div');
  frontFace.classList.add('card-face', 'card-front');
  if (card.isRed) frontFace.classList.add('red');
  
  frontFace.innerHTML = `
    <div>${card.value}</div>
    <div class="card-center">${card.suit}</div>
    <div style="text-align: right;">${card.value}</div>
  `;
  cardEl.appendChild(backFace);
  cardEl.appendChild(frontFace);
  return cardEl;
}

function renderCards(container, cards, hideSecond = false) {
  if (!cards) cards = [];
  
  // On retire les cartes en trop si on recommence une nouvelle main
  while(container.children.length > cards.length) {
    container.removeChild(container.lastChild);
  }
  
  // On ajoute les nouvelles cartes
  for(let i = container.children.length; i < cards.length; i++) {
    let cardEl = createCardElement(cards[i]);
    container.appendChild(cardEl);
  }
  
  // On utilise un très court délai (50ms) pour laisser le navigateur intégrer la carte
  setTimeout(() => {
    Array.from(container.children).forEach((cardEl, i) => {
      // LA CORRECTION EST ICI : On force le retrait de l'animation CSS 
      // pour "débloquer" la carte et autoriser la rotation 3D.
      cardEl.classList.remove('deal-animation');
      
      if (hideSecond && i === 1) {
        cardEl.classList.remove('flipped');
      } else {
        cardEl.classList.add('flipped');
      }
    });
  }, 50);
}
