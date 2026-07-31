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
const btnSplit = document.getElementById('btn-split');
const bettingControls = document.getElementById('betting-controls');
const betLabel = document.getElementById('bet-label');
const betInput = document.getElementById('bet-input');
const btnBet = document.getElementById('btn-bet');
const btnReload = document.getElementById('btn-reload');

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
  playerName = lobbyName.value.trim() || "Joueur 1";
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
        [myPlayerId]: { name: playerName, chips: 1000, bet: 0, status: 'active', reloads: 0 }
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
  let requestedName = lobbyName.value.trim();
  roomCode = lobbyCode.value.trim().toUpperCase();
  
  if (roomCode.length === 0) return;
  
  try {
    const snapshot = await get(ref(db, 'rooms/' + roomCode));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const currentPlayersCount = data.turnOrder ? data.turnOrder.length : 0;
      
      if (data.phase !== 'waiting') return lobbyError.classList.remove('hidden'), lobbyError.textContent = "La partie a déjà commencé.";
      if (currentPlayersCount >= data.maxPlayers) return lobbyError.classList.remove('hidden'), lobbyError.textContent = "Le salon est plein.";

      playerName = requestedName || `Joueur ${currentPlayersCount + 1}`;
      let newTurnOrder = data.turnOrder || [];
      newTurnOrder.push(myPlayerId);

      await update(ref(db, 'rooms/' + roomCode), {
        [`players/${myPlayerId}`]: { name: playerName, chips: 1000, bet: 0, status: 'active', reloads: 0 },
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
  }
});

function enterGameRoom() {
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  displayRoomCode.textContent = roomCode;
  
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

  if (elPlayersContainer.children.length !== gameState.turnOrder.length) {
    elPlayersContainer.innerHTML = '';
    gameState.turnOrder.forEach((pId) => {
      const pZone = document.createElement('div');
      pZone.className = 'player-zone';
      pZone.innerHTML = `
        <div class="hands-wrapper" style="display: flex; gap: 20px; justify-content: center;">
          <div class="cards-container" id="p-${pId}-cards" style="transition: box-shadow 0.3s; border-radius: 8px;"></div>
          <div class="cards-container hidden" id="p-${pId}-split-cards" style="transition: box-shadow 0.3s; border-radius: 8px;"></div>
        </div>
        <div class="player-info" id="p-${pId}-info">
          <span class="player-name" id="p-${pId}-name"></span>
          <span class="player-chips">Score: <span id="p-${pId}-score">0</span> | <span id="p-${pId}-chips"></span> € <span style="font-size:0.8em; color:#aaa;">(♻️ <span id="p-${pId}-reloads"></span>)</span></span>
          <span id="p-${pId}-bet" style="color: #ffd700; font-size: 0.85em;">Mise: 0 €</span>
        </div>
      `;
      elPlayersContainer.appendChild(pZone);
    });
  }

  gameState.turnOrder.forEach((pId, index) => {
    const p = gameState.players[pId];
    document.getElementById(`p-${pId}-name`).textContent = p.name + (pId === myPlayerId ? " (Vous)" : "");
    document.getElementById(`p-${pId}-chips`).textContent = p.chips;
    document.getElementById(`p-${pId}-reloads`).textContent = p.reloads || 0;
    
    // GESTION DE L'AFFICHAGE DU SCORE ET DE LA MISE EN CAS DE SPLIT
    let scoreTxt = calculateScore(p.cards || []).toString();
    let betTxt = `Mise: ${p.bet} €`;
    const splitContainer = document.getElementById(`p-${pId}-split-cards`);
    
    renderCards(document.getElementById(`p-${pId}-cards`), p.cards || [], false);

    if (p.splitCards) {
      splitContainer.classList.remove('hidden');
      renderCards(splitContainer, p.splitCards, false);
      scoreTxt += ` | ${calculateScore(p.splitCards)}`;
      betTxt = `Mises: ${p.bet} € | ${p.splitBet} €`;
    } else {
      splitContainer.classList.add('hidden');
    }

    document.getElementById(`p-${pId}-score`).textContent = scoreTxt;

    if (gameState.phase === 'resolved' && p.resultMsg) {
      document.getElementById(`p-${pId}-bet`).textContent = p.resultMsg;
    } else {
      document.getElementById(`p-${pId}-bet`).textContent = betTxt;
    }

    // SURBRILLANCE DYNAMIQUE (Pour le joueur, et pour sa main active s'il a Split)
    const infoBox = document.getElementById(`p-${pId}-info`);
    const hand1Box = document.getElementById(`p-${pId}-cards`);
    const hand2Box = document.getElementById(`p-${pId}-split-cards`);
    
    infoBox.classList.remove('active-player-highlight');
    hand1Box.style.boxShadow = 'none';
    hand2Box.style.boxShadow = 'none';

    if ((gameState.phase === 'betting' || gameState.phase === 'playing') && gameState.activeTurnIndex === index) {
      infoBox.classList.add('active-player-highlight');
      if (gameState.phase === 'playing' && p.splitCards) {
        if ((p.activeHand || 1) === 1) hand1Box.style.boxShadow = '0 0 15px #ffd700';
        else hand2Box.style.boxShadow = '0 0 15px #ffd700';
      }
    }
  });

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
  
  actionButtons.classList.add('hidden');
  bettingControls.classList.add('hidden');
  btnStart.classList.add('hidden');
  btnSplit.classList.add('hidden');

  if (gameState.phase === 'waiting') {
    const count = gameState.turnOrder.length;
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
      
      if (maxBet < 10) {
        betLabel.classList.add('hidden');
        btnBet.classList.add('hidden');
        btnReload.classList.remove('hidden');
        elGameMessage.textContent = `Fonds insuffisants. Rechargez pour continuer !`;
      } else {
        betLabel.classList.remove('hidden');
        btnBet.classList.remove('hidden');
        btnReload.classList.add('hidden');
        betInput.max = maxBet;
        betInput.value = Math.min(50, maxBet);
        elGameMessage.textContent = `À vous de miser (Solde: ${maxBet} €)`;
      }
    } else {
      elGameMessage.textContent = `En attente de la mise de ${gameState.players[activeId].name}...`;
    }
  }
  else if (gameState.phase === 'dealing') {
    elGameMessage.textContent = "Distribution des cartes...";
    if (isHost && !isDealing) {
      isDealing = true;
      let newDeck = createDeck();
      let updates = {};
      gameState.turnOrder.forEach(pId => { updates[`players/${pId}/cards`] = [newDeck.pop(), newDeck.pop()]; });
      updates['dealerCards'] = [newDeck.pop(), newDeck.pop()];
      updates['deck'] = newDeck;
      updates['phase'] = 'playing';
      updates['activeTurnIndex'] = 0;
      await update(ref(db, 'rooms/' + roomCode), updates);
      isDealing = false;
    }
  }
  else if (gameState.phase === 'playing') {
    const p = gameState.players[activeId];
    const activeHand = p.activeHand || 1;
    let currentCards = activeHand === 1 ? (p.cards || []) : (p.splitCards || []);
    const pScore = calculateScore(currentCards);
    
    if (activeId === myPlayerId) {
      if (pScore < 21) {
        actionButtons.classList.remove('hidden');
        elGameMessage.textContent = p.splitCards ? `Main ${activeHand} : Tirer ou Rester ?` : "À vous de jouer : Tirer ou Rester ?";
        
        // CHECK ELIGIBILITE POUR LE SPLIT
        if (p.cards.length === 2 && !p.splitCards && activeHand === 1) {
          let v1 = p.cards[0].value;
          let v2 = p.cards[1].value;
          let isSameValue = (v1 === v2) || (['10','J','Q','K'].includes(v1) && ['10','J','Q','K'].includes(v2));
          if (isSameValue && p.chips >= p.bet) {
            btnSplit.classList.remove('hidden');
          }
        }
      } else {
        let msg = (pScore === 21 && currentCards.length === 2 && !p.splitCards) ? "Blackjack !" : (pScore > 21 ? "Bust !" : "21 !");
        elGameMessage.textContent = p.splitCards ? `Main ${activeHand} : ${msg}` : msg;
        
        // Auto-passe à la main suivante ou joueur suivant après 1 seconde
        let currentStatus = activeHand === 1 ? p.status : p.splitStatus;
        if (currentStatus !== 'stand' && currentStatus !== 'bust') {
          setTimeout(() => endHand(pScore > 21 ? 'bust' : 'stand'), 1000);
        }
      }
    } else {
      elGameMessage.textContent = `Au tour de ${p.name}...`;
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
    // Nettoyage des données de Split pour la nouvelle manche
    updates[`players/${pId}/splitCards`] = null;
    updates[`players/${pId}/splitBet`] = null;
    updates[`players/${pId}/splitStatus`] = null;
    updates[`players/${pId}/activeHand`] = 1;
  });
  await update(ref(db, 'rooms/' + roomCode), updates);
});

btnReload.addEventListener('click', async () => {
  const myData = gameState.players[myPlayerId];
  await update(ref(db, 'rooms/' + roomCode + '/players/' + myPlayerId), {
    chips: (myData.chips || 0) + 1000,
    reloads: (myData.reloads || 0) + 1
  });
});

btnBet.addEventListener('click', async () => {
  const bet = parseInt(betInput.value);
  const myData = gameState.players[myPlayerId];
  if (bet > myData.chips || bet < 10) return;
  
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
  actionButtons.classList.add('hidden'); // Anti-spam click
  let deck = gameState.deck || [];
  const p = gameState.players[myPlayerId];
  let activeHand = p.activeHand || 1;
  
  let cardTarget = activeHand === 1 ? 'cards' : 'splitCards';
  let myCards = p[cardTarget] || [];
  
  myCards.push(deck.pop());
  
  await update(ref(db, 'rooms/' + roomCode), {
    'deck': deck,
    [`players/${myPlayerId}/${cardTarget}`]: myCards
  });
});

btnStand.addEventListener('click', () => {
  actionButtons.classList.add('hidden');
  endHand('stand');
});

// GESTION DU BOUTON SPLIT
btnSplit.addEventListener('click', async () => {
  actionButtons.classList.add('hidden');
  const p = gameState.players[myPlayerId];
  let deck = gameState.deck || [];
  
  let card1 = p.cards[0];
  let card2 = p.cards[1];
  
  let updates = {};
  updates[`players/${myPlayerId}/chips`] = p.chips - p.bet; // Prélève la 2ème mise
  updates[`players/${myPlayerId}/splitBet`] = p.bet;
  
  // Séparation des cartes et ajout direct d'une nouvelle carte à chacune
  updates[`players/${myPlayerId}/cards`] = [card1, deck.pop()];
  updates[`players/${myPlayerId}/splitCards`] = [card2, deck.pop()];
  
  updates[`players/${myPlayerId}/activeHand`] = 1;
  updates[`players/${myPlayerId}/splitStatus`] = 'active';
  updates['deck'] = deck;
  
  await update(ref(db, 'rooms/' + roomCode), updates);
});

// Fonction universelle pour terminer une main (gère le passage Main 1 -> Main 2 -> Joueur suivant)
async function endHand(newStatus) {
  const p = gameState.players[myPlayerId];
  let updates = {};
  
  if ((p.activeHand || 1) === 1) {
    updates[`players/${myPlayerId}/status`] = newStatus;
    if (p.splitCards) {
      // S'il a split, on passe simplement à la main 2
      updates[`players/${myPlayerId}/activeHand`] = 2;
    } else {
      passTurn(updates);
    }
  } else {
    // Il jouait sa main 2, il a fini son tour
    updates[`players/${myPlayerId}/splitStatus`] = newStatus;
    passTurn(updates);
  }
  
  if (Object.keys(updates).length > 0) {
    await update(ref(db, 'rooms/' + roomCode), updates);
  }
}

function passTurn(updates) {
  const nextIndex = gameState.activeTurnIndex + 1;
  if (nextIndex >= gameState.turnOrder.length) {
    updates['phase'] = 'dealer_turn';
  } else {
    updates['activeTurnIndex'] = nextIndex;
  }
}

// ==========================================
// 5. TOUR DU CROUPIER & RÉSOLUTION DES SPLITS
// ==========================================
async function playDealerTurn() {
  let currentDeck = gameState.deck || [];
  let dCards = gameState.dealerCards || [];
  let dScore = calculateScore(dCards);
  
  while (dScore < 17 && currentDeck.length > 0) {
    await new Promise(r => setTimeout(r, 1000));
    dCards.push(currentDeck.pop());
    dScore = calculateScore(dCards);
    await update(ref(db, 'rooms/' + roomCode), { dealerCards: dCards, deck: currentDeck });
  }
  
  await new Promise(r => setTimeout(r, 1000));
  
  let updates = {};
  gameState.turnOrder.forEach(pId => {
    const p = gameState.players[pId];
    
    // Fonction interne pour calculer les gains d'UNE main
    const resolveHand = (handCards, handBet, handStatus) => {
      const pScore = calculateScore(handCards || []);
      let winnings = 0; let msg = '';
      
      if (handStatus === 'bust' || pScore > 21) { msg = 'Bust'; }
      else if (pScore === 21 && handCards.length === 2 && !p.splitCards) { 
        // Le Blackjack paie 3:2 uniquement s'il n'y a pas eu de split
        if (dScore === 21 && dCards.length === 2) { winnings = handBet; msg = 'Égalité (BJ)'; } 
        else { winnings = handBet * 2.5; msg = 'Blackjack !'; }
      } 
      else if (dScore > 21 || pScore > dScore) { winnings = handBet * 2; msg = 'Gagné'; } 
      else if (pScore === dScore) { winnings = handBet; msg = 'Égalité'; } 
      else { msg = 'Perdu'; }
      return { winnings, msg };
    };

    // Résolution Main 1
    let h1 = resolveHand(p.cards, p.bet, p.status);
    let totalWinnings = h1.winnings;
    let totalMsg = h1.msg;

    // Résolution Main 2 (si Split)
    if (p.splitCards) {
      let h2 = resolveHand(p.splitCards, p.splitBet, p.splitStatus);
      totalWinnings += h2.winnings;
      totalMsg = `${h1.msg} | ${h2.msg}`;
    }

    updates[`players/${pId}/chips`] = p.chips + totalWinnings;
    updates[`players/${pId}/resultMsg`] = totalMsg;
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
  if(!card) return cardEl; 
  
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
  while(container.children.length > cards.length) { container.removeChild(container.lastChild); }
  for(let i = container.children.length; i < cards.length; i++) {
    container.appendChild(createCardElement(cards[i]));
  }
  setTimeout(() => {
    Array.from(container.children).forEach((cardEl, i) => {
      cardEl.classList.remove('deal-animation');
      if (hideSecond && i === 1) cardEl.classList.remove('flipped');
      else cardEl.classList.add('flipped');
    });
  }, 50);
}
