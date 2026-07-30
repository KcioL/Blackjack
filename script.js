import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Configuration Firebase intégrée depuis ta capture d'écran
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

let deck = [];
let players = [];
let dealerCards = [];

let activePlayerIndex = 0;
let currentPhase = 'idle'; 

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
let isGameStarted = false; // Bloque la modification de l'UI de la table une fois en jeu

// ==========================================
// GESTION DU LOBBY ET SYNCHRONISATION
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
    // On crée la salle avec le nombre max de joueurs défini par l'Hôte
    await set(ref(db, 'rooms/' + roomCode), {
      phase: 'waiting',
      host: playerName,
      maxPlayers: maxPlayers,
      createdAt: Date.now(),
      players: {
        [myPlayerId]: { name: playerName, chips: 1000 }
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
      const currentPlayersCount = data.players ? Object.keys(data.players).length : 0;
      
      // Sécurité : Vérifier si la partie a commencé ou est pleine
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

      // Ajout du joueur dans Firebase
      await update(ref(db, 'rooms/' + roomCode + '/players'), {
        [myPlayerId]: { name: playerName, chips: 1000 }
      });

      isHost = false;
      enterGameRoom();
    } else {
      lobbyError.textContent = "Ce code de salon n'existe pas.";
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
  lobbyError.classList.add('hidden');
  
  // Écoute des changements de la salle en temps réel
  onValue(ref(db, 'rooms/' + roomCode), (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const playerIds = Object.keys(data.players || {});
    const currentPlayersCount = playerIds.length;

    // On met à jour l'affichage des joueurs TANT QUE la partie n'a pas commencé
    if (!isGameStarted) {
      setupTableFromFirebase(data.players);

      if (data.phase === 'waiting') {
        elGameMessage.textContent = `En attente de joueurs... (${currentPlayersCount}/${data.maxPlayers})`;
        
        // Si le salon est plein
        if (currentPlayersCount === data.maxPlayers) {
          if (isHost) {
            elGameMessage.textContent = "Tout le monde est là ! Vous pouvez lancer la partie.";
            btnStart.classList.remove('hidden');
          } else {
            elGameMessage.textContent = "Tout le monde est là ! En attente de l'hôte pour lancer...";
            btnStart.classList.add('hidden');
          }
        } else {
          btnStart.classList.add('hidden');
        }
      } 
      else if (data.phase === 'playing') {
        // L'hôte a cliqué sur "Lancer la partie"
        isGameStarted = true;
        btnStart.classList.add('hidden');
        currentPhase = 'betting';
        activePlayerIndex = 0;
        processBettingPhase();
      }
    }
  });
}

// Transforme l'objet Firebase en un tableau "players" utilisable par le jeu
function setupTableFromFirebase(playersObj) {
  elPlayersContainer.innerHTML = '';
  players = [];
  
  let i = 0;
  for (const pId in playersObj) {
    const pData = playersObj[pId];
    
    const pZone = document.createElement('div');
    pZone.className = 'player-zone';
    pZone.innerHTML = `
      <div class="cards-container" id="p${i}-cards"></div>
      <div class="player-info" id="p${i}-info">
        <span class="player-name">${pData.name} ${pId === myPlayerId ? '(Vous)' : ''}</span>
        <span class="player-chips">Score: <span id="p${i}-score">0</span> | <span id="p${i}-chips">${pData.chips}</span> €</span>
        <span id="p${i}-bet" style="color: #ffd700; font-size: 0.85em;">Mise: 0 €</span>
      </div>
    `;
    elPlayersContainer.appendChild(pZone);

    players.push({
      id: i, firebaseId: pId, name: pData.name,
      cards: [], bet: 0, chips: pData.chips,
      elCards: document.getElementById(`p${i}-cards`),
      elScore: document.getElementById(`p${i}-score`),
      elChips: document.getElementById(`p${i}-chips`),
      elBetDisplay: document.getElementById(`p${i}-bet`),
      elInfo: document.getElementById(`p${i}-info`),
      status: 'active'
    });
    i++;
  }
}

// L'hôte déclenche le début de la partie pour tout le monde
btnStart.addEventListener('click', async () => {
  await update(ref(db, 'rooms/' + roomCode), {
    phase: 'playing'
  });
});


// ==========================================
// LOGIQUE DU BLACKJACK LOCAL
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
  deck = [];
  for (let suit of SUITS) {
    for (let value of VALUES) {
      deck.push({ value, suit, isRed: suit === '♥' || suit === '♦' });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function createCardElement(card) {
  const cardEl = document.createElement('div');
  cardEl.classList.add('card', 'deal-animation');

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

function dealCardToZone(cardData, container) {
  return new Promise(resolve => {
    setTimeout(() => {
      const cardEl = createCardElement(cardData);
      container.appendChild(cardEl);
      resolve(cardEl);
    }, 150);
  });
}

function revealCard(cardEl) {
  cardEl.classList.remove('deal-animation');
  setTimeout(() => { cardEl.classList.add('flipped'); }, 50);
}

function updateScores(hideDealerCard = true) {
  players.forEach(p => p.elScore.textContent = calculateScore(p.cards));
  if (hideDealerCard && dealerCards.length > 0) elDealerScore.textContent = calculateScore([dealerCards[0]]);
  else elDealerScore.textContent = calculateScore(dealerCards);
}

function highlightActivePlayer() {
  players.forEach(p => p.elInfo.classList.remove('active-player-highlight'));
  if (activePlayerIndex < players.length) {
    players[activePlayerIndex].elInfo.classList.add('active-player-highlight');
  }
}

function processBettingPhase() {
  if (activePlayerIndex >= players.length) {
    currentPhase = 'playing';
    bettingControls.classList.add('hidden');
    startCardDistribution();
    return;
  }

  const p = players[activePlayerIndex];
  highlightActivePlayer();
  
  elGameMessage.textContent = `${p.name} : Choisissez votre mise (Solde : ${p.chips} €)`;
  
  betInput.max = p.chips;
  betInput.value = Math.min(50, p.chips); 

  bettingControls.classList.remove('hidden');
  actionButtons.classList.add('hidden');
}

btnBet.addEventListener('click', () => {
  const p = players[activePlayerIndex];
  let chosenBet = parseInt(betInput.value);
  
  if (chosenBet > p.chips || chosenBet < 10) {
    alert("Mise invalide ou solde insuffisant.");
    return;
  }

  p.bet = chosenBet;
  p.chips -= chosenBet;
  p.elChips.textContent = p.chips;
  p.elBetDisplay.textContent = `Mise: ${chosenBet} €`;

  activePlayerIndex++;
  processBettingPhase(); 
});

async function startCardDistribution() {
  createDeck();
  dealerCards = [];
  elDealerCards.innerHTML = '';
  elGameMessage.textContent = "Distribution des cartes...";
  players.forEach(p => p.elInfo.classList.remove('active-player-highlight'));

  for (let round = 0; round < 2; round++) {
    for (let p of players) {
      p.cards.push(deck.pop());
      const cardEl = await dealCardToZone(p.cards[p.cards.length - 1], p.elCards);
      revealCard(cardEl); 
    }
    dealerCards.push(deck.pop());
    const dCardEl = await dealCardToZone(dealerCards[dealerCards.length - 1], elDealerCards);
    if (round === 0) revealCard(dCardEl);
  }

  updateScores(true);
  activePlayerIndex = 0;
  startPlayerTurn();
}

function startPlayerTurn() {
  if (activePlayerIndex >= players.length) {
    players.forEach(p => p.elInfo.classList.remove('active-player-highlight'));
    playDealerTurn();
    return;
  }

  const p = players[activePlayerIndex];
  highlightActivePlayer();
  
  if (calculateScore(p.cards) === 21) {
    p.status = 'blackjack';
    elGameMessage.textContent = `Blackjack pour ${p.name} !`;
    setTimeout(() => { activePlayerIndex++; startPlayerTurn(); }, 1500);
    return;
  }

  actionButtons.classList.remove('hidden');
  elGameMessage.textContent = `À vous de jouer ${p.name} : Tirer ou Rester ?`;
}

btnHit.addEventListener('click', async () => {
  actionButtons.classList.add('hidden');
  const p = players[activePlayerIndex];
  
  const newCard = deck.pop();
  p.cards.push(newCard);
  
  const cardEl = await dealCardToZone(newCard, p.elCards);
  revealCard(cardEl);
  updateScores(true);

  const score = calculateScore(p.cards);
  
  if (score > 21) {
    p.status = 'bust';
    elGameMessage.textContent = `Bust ! ${p.name} a sauté.`;
    setTimeout(() => { activePlayerIndex++; startPlayerTurn(); }, 1500);
  } else if (score === 21) {
    p.status = 'stand';
    setTimeout(() => { activePlayerIndex++; startPlayerTurn(); }, 1000);
  } else {
    actionButtons.classList.remove('hidden');
  }
});

btnStand.addEventListener('click', () => {
  players[activePlayerIndex].status = 'stand';
  activePlayerIndex++;
  startPlayerTurn();
});

async function playDealerTurn() {
  actionButtons.classList.add('hidden');
  elGameMessage.textContent = "Tour du croupier...";
  
  revealCard(elDealerCards.children[1]); 
  updateScores(false);
  
  let dScore = calculateScore(dealerCards);
  while (dScore < 17) {
    await new Promise(r => setTimeout(r, 800)); 
    const newCard = deck.pop();
    dealerCards.push(newCard);
    const cardEl = await dealCardToZone(newCard, elDealerCards);
    revealCard(cardEl);
    dScore = calculateScore(dealerCards);
    updateScores(false);
  }

  resolveBets(dScore);
}

function resolveBets(dScore) {
  let message = "";
  
  players.forEach((p) => {
    const pScore = calculateScore(p.cards);
    let winnings = 0;
    
    if (p.status === 'bust') {
      message += `${p.name} perd. `;
    } else if (p.status === 'blackjack') {
      if (dScore === 21 && dealerCards.length === 2) {
        message += `${p.name} égalité (BJ). `;
        winnings = p.bet;
      } else {
        message += `${p.name} BJ ! `;
        winnings = p.bet * 2.5; 
      }
    } else {
      if (dScore > 21 || pScore > dScore) {
        message += `${p.name} gagne ! `;
        winnings = p.bet * 2; 
      } else if (pScore === dScore) {
        message += `${p.name} égalité. `;
        winnings = p.bet;
      } else {
        message += `${p.name} perd. `;
      }
    }
    
    p.chips += winnings;
    p.elChips.textContent = p.chips;
  });

  elGameMessage.textContent = message;
  
  if (isHost) {
    setTimeout(() => { 
      // Reset logic to be implemented later for new rounds over Firebase
      btnStart.classList.remove('hidden'); 
      btnStart.textContent = "Relancer une main";
    }, 2000);
  }
}
