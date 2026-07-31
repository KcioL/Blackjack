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
const btnDouble = document.getElementById('btn-double');
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
        [myPlayerId]: { 
          name: playerName, chips: 1000, reloads: 0, activeHandIndex: 0,
          hands: [{ bet: 0, cards: [], status: 'active', resultMsg: null, isDoubled: false }] 
        }
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
        [`players/${myPlayerId}`]: { 
          name: playerName, chips: 1000, reloads: 0, activeHandIndex: 0,
          hands: [{ bet: 0, cards: [], status: 'active', resultMsg: null, isDoubled: false }] 
        },
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
      pZone.id = `pzone-${pId}`;
      elPlayersContainer.appendChild(pZone);
    });
  }

  gameState.turnOrder.forEach((pId, index) => {
    const p = gameState.players[pId];
    const pZone = document.getElementById(`pzone-${pId}`);
    
    let hands = p.hands || [{ bet: 0, cards: [] }]; 
    
    let handsHtml = `<div class="hands-wrapper" style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">`;
    hands.forEach((hand, hIdx) => {
        handsHtml += `<div class="cards-container" id="p-${pId}-cards-${hIdx}" style="transition: box-shadow 0.3s; border-radius: 8px; padding: 5px;"></div>`;
    });
    handsHtml += `</div>`;
    
    // GESTION DU SCORE CACHÉ SI LE JOUEUR A DOUBLÉ
    let scores = hands.map(h => {
      if (h.isDoubled && gameState.phase === 'playing') {
        return calculateScore(h.cards.slice(0, 2)) + " + ?";
      }
      return calculateScore(h.cards || []);
    }).join(" | ");

    let bets = hands.map(h => h.bet).join(" € | ") + (hands.length > 0 ? " €" : "");
    if (gameState.phase === 'resolved') {
        bets = hands.map(h => h.resultMsg || '').join(" | ");
    }
    
    let infoHtml = `
      <div class="player-info" id="p-${pId}-info">
        <span class="player-name">${p.name}${pId === myPlayerId ? " (Vous)" : ""}</span>
        <span class="player-chips">Score: <span>${scores}</span> | <span>${p.chips}</span> € <span style="font-size:0.8em; color:#aaa;">(♻️ ${p.reloads || 0})</span></span>
        <span style="color: #ffd700; font-size: 0.85em;">${bets}</span>
      </div>
    `;
    
    let handsWrapper = pZone.querySelector('.hands-wrapper');
    if (!handsWrapper || handsWrapper.children.length !== hands.length) {
        pZone.innerHTML = handsHtml + infoHtml;
    } else {
        let infoBox = pZone.querySelector('.player-info');
        infoBox.outerHTML = infoHtml; 
    }
    
    hands.forEach((hand, hIdx) => {
        const container = document.getElementById(`p-${pId}-cards-${hIdx}`);
        // On cache la dernière carte de la main si le joueur a doublé et qu'on est en cours de jeu
        const hideLast = (hand.isDoubled && gameState.phase === 'playing');
        
        renderCards(container, hand.cards || [], false, hideLast);
        
        if ((gameState.phase === 'playing') && gameState.activeTurnIndex === index) {
            if (hIdx === (p.activeHandIndex || 0)) {
                container.style.boxShadow = '0 0 15px #ffd700';
            } else {
                container.style.boxShadow = 'none';
            }
        } else {
            container.style.boxShadow = 'none';
        }
    });

    const infoBox = document.getElementById(`p-${pId}-info`);
    if ((gameState.phase === 'betting' || gameState.phase === 'playing') && gameState.activeTurnIndex === index) {
      infoBox.classList.add('active-player-highlight');
    } else {
      infoBox.classList.remove('active-player-highlight');
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
  btnDouble.classList.add('hidden');

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
        betInput.value = Math.min(100, maxBet);
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
      
      gameState.turnOrder.forEach(pId => { 
        let h = gameState.players[pId].hands || [{ bet: 0 }];
        h[0].cards = [newDeck.pop(), newDeck.pop()];
        updates[`players/${pId}/hands`] = h;
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
    const p = gameState.players[activeId];
    const activeHandIndex = p.activeHandIndex || 0;
    const currentHand = p.hands[activeHandIndex];
    const currentCards = currentHand.cards || [];
    const pScore = calculateScore(currentCards);
    
    if (activeId === myPlayerId) {
      if (pScore < 21) {
        actionButtons.classList.remove('hidden');
        elGameMessage.textContent = p.hands.length > 1 ? `Main ${activeHandIndex + 1} : Tirer ou Rester ?` : "À vous de jouer : Tirer ou Rester ?";
        
        // CONDITIONS POUR SPLIT ET DOUBLE
        if (currentCards.length === 2) {
          if (p.chips >= currentHand.bet) {
            btnDouble.classList.remove('hidden'); // Double autorisé sur la 1ère action
            
            let v1 = currentCards[0].value;
            let v2 = currentCards[1].value;
            let isSameValue = (v1 === v2) || (['10','J','Q','K'].includes(v1) && ['10','J','Q','K'].includes(v2));
            if (isSameValue) {
              btnSplit.classList.remove('hidden');
            }
          }
        }
      } else {
        let msg = (pScore === 21 && currentCards.length === 2 && p.hands.length === 1) ? "Blackjack !" : (pScore > 21 ? "Bust !" : "21 !");
        elGameMessage.textContent = p.hands.length > 1 ? `Main ${activeHandIndex + 1} : ${msg}` : msg;
        
        if (currentHand.status !== 'stand' && currentHand.status !== 'bust') {
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
    updates[`players/${pId}/hands`] = [{ bet: 0, cards: [], status: 'active', resultMsg: null, isDoubled: false }];
    updates[`players/${pId}/activeHandIndex`] = 0;
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
  let myHands = [{ bet: bet, cards: [], status: 'active', resultMsg: null, isDoubled: false }];
  updates[`players/${myPlayerId}/hands`] = myHands;
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
  actionButtons.classList.add('hidden'); 
  let deck = gameState.deck || [];
  const p = gameState.players[myPlayerId];
  let activeHandIndex = p.activeHandIndex || 0;
  let myHands = p.hands;
  
  myHands[activeHandIndex].cards.push(deck.pop());
  
  await update(ref(db, 'rooms/' + roomCode), {
    'deck': deck,
    [`players/${myPlayerId}/hands`]: myHands
  });
});

btnStand.addEventListener('click', () => {
  actionButtons.classList.add('hidden');
  endHand('stand');
});

// NOUVELLE ACTION: DOUBLE DOWN
btnDouble.addEventListener('click', async () => {
  actionButtons.classList.add('hidden');
  const p = gameState.players[myPlayerId];
  let deck = gameState.deck || [];
  let activeHandIndex = p.activeHandIndex || 0;
  let myHands = p.hands;
  let currentHand = myHands[activeHandIndex];
  
  let updates = {};
  // On déduit la mise une seconde fois et on l'ajoute au pot de la main
  updates[`players/${myPlayerId}/chips`] = p.chips - currentHand.bet;
  currentHand.bet *= 2;
  currentHand.isDoubled = true;
  
  // On tire exactement une seule carte
  currentHand.cards.push(deck.pop());
  
  updates[`players/${myPlayerId}/hands`] = myHands;
  updates['deck'] = deck;
  
  await update(ref(db, 'rooms/' + roomCode), updates);
  
  // Le tour se termine obligatoirement après un double
  endHand('stand'); 
});

btnSplit.addEventListener('click', async () => {
  actionButtons.classList.add('hidden');
  const p = gameState.players[myPlayerId];
  let deck = gameState.deck || [];
  let activeHandIndex = p.activeHandIndex || 0;
  let myHands = p.hands;
  
  let currentHand = myHands[activeHandIndex];
  let card1 = currentHand.cards[0];
  let card2 = currentHand.cards[1];
  
  let updates = {};
  updates[`players/${myPlayerId}/chips`] = p.chips - currentHand.bet; 
  
  currentHand.cards = [card1, deck.pop()];
  
  let newHand = {
    bet: currentHand.bet,
    cards: [card2, deck.pop()],
    status: 'active',
    resultMsg: null,
    isDoubled: false
  };
  
  myHands.splice(activeHandIndex + 1, 0, newHand); 
  
  updates[`players/${myPlayerId}/hands`] = myHands;
  updates['deck'] = deck;
  
  await update(ref(db, 'rooms/' + roomCode), updates);
});

async function endHand(newStatus) {
  const p = gameState.players[myPlayerId];
  let myHands = p.hands;
  let activeHandIndex = p.activeHandIndex || 0;
  
  myHands[activeHandIndex].status = newStatus;
  
  let updates = { [`players/${myPlayerId}/hands`]: myHands };
  
  if (activeHandIndex + 1 < myHands.length) {
    updates[`players/${myPlayerId}/activeHandIndex`] = activeHandIndex + 1;
    await update(ref(db, 'rooms/' + roomCode), updates);
  } else {
    const nextIndex = gameState.activeTurnIndex + 1;
    if (nextIndex >= gameState.turnOrder.length) {
      updates['phase'] = 'dealer_turn';
    } else {
      updates['activeTurnIndex'] = nextIndex;
    }
    await update(ref(db, 'rooms/' + roomCode), updates);
  }
}

// ==========================================
// 5. TOUR DU CROUPIER & RÉSOLUTION
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
    let totalWinnings = 0;
    
    let myHands = p.hands || [];
    myHands.forEach(hand => {
       const pScore = calculateScore(hand.cards || []);
       let winnings = 0; let msg = '';
       
       if (hand.status === 'bust' || pScore > 21) { msg = 'Bust'; }
       else if (pScore === 21 && (hand.cards || []).length === 2 && myHands.length === 1 && !hand.isDoubled) {
         if (dScore === 21 && dCards.length === 2) { winnings = hand.bet; msg = 'Égalité (BJ)'; }
         else { winnings = hand.bet * 2.5; msg = 'Blackjack !'; }
       }
       else if (dScore > 21 || pScore > dScore) { winnings = hand.bet * 2; msg = 'Gagné'; }
       else if (pScore === dScore) { winnings = hand.bet; msg = 'Égalité'; }
       else { msg = 'Perdu'; }
       
       totalWinnings += winnings;
       hand.resultMsg = msg;
    });
    
    updates[`players/${pId}/chips`] = p.chips + totalWinnings;
    updates[`players/${pId}/hands`] = myHands;
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

function renderCards(container, cards, hideSecond = false, hideLast = false) {
  if (!cards) cards = [];
  
  while(container.children.length > cards.length) {
    container.removeChild(container.lastChild);
  }
  
  for(let i = 0; i < cards.length; i++) {
    let expectedStr = cards[i].value + cards[i].suit;
    
    if (i < container.children.length) {
      let cardEl = container.children[i];
      if (cardEl.dataset.card !== expectedStr) {
        let newCardEl = createCardElement(cards[i]);
        newCardEl.dataset.card = expectedStr;
        container.replaceChild(newCardEl, cardEl);
      }
    } else {
      let cardEl = createCardElement(cards[i]);
      cardEl.dataset.card = expectedStr;
      container.appendChild(cardEl);
    }
  }
  
  setTimeout(() => {
    Array.from(container.children).forEach((cardEl, i) => {
      cardEl.classList.remove('deal-animation');
      
      // La 2ème carte du croupier OU la dernière carte d'un joueur qui a doublé restent face cachée
      if ((hideSecond && i === 1) || (hideLast && i === cards.length - 1)) {
        cardEl.classList.remove('flipped');
      } else {
        cardEl.classList.add('flipped');
      }
    });
  }, 50);
}
