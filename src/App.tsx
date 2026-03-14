/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, Trophy, Undo2, Play, ChevronLeft, Lock, Star, HelpCircle, Info, X, ArrowDownToLine, ArrowUpFromLine, Ban, Zap, Shield, Magnet, Orbit, Bomb, ArrowDownUp, Calendar } from 'lucide-react';
import { COLORS, TUBE_CAPACITY, GameState, Color, TubeObstacle, PowerUpType, Bubble } from './types';

// Sound utility for "tinking" sound
const playTink = (frequency = 800, duration = 0.1) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, audioCtx.currentTime + duration);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn('Audio not supported', e);
  }
};

type View = 'menu' | 'game';

export default function App() {
  const [view, setView] = useState<View>('menu');
  const [level, setLevel] = useState(1);
  const [maxUnlockedLevel, setMaxUnlockedLevel] = useState(() => {
    const saved = localStorage.getItem('bubble-sort-max-level');
    return saved ? parseInt(saved) : 1;
  });
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('bubble-sort-high-score');
    return saved ? parseInt(saved) : 0;
  });

  const [showHelp, setShowHelp] = useState(false);

  const [forbiddenTubeIndex, setForbiddenTubeIndex] = useState<number | null>(null);
  const [combo, setCombo] = useState(0);
  const [lastMoveTime, setLastMoveTime] = useState(0);

  const initGame = useCallback((currentLevel: number, isDaily = false) => {
    // Simple seedable random for daily challenge
    const seed = isDaily ? new Date().toISOString().slice(0, 10).replace(/-/g, '') : Math.random().toString();
    const seededRandom = () => {
      let s = 0;
      for (let i = 0; i < seed.length; i++) s = (s << 5) - s + seed.charCodeAt(i);
      return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    };
    const random = seededRandom()();

    const colorsCount = isDaily ? 8 : Math.min(3 + Math.floor((currentLevel - 1) / 2), COLORS.length);
    const emptyCount = isDaily ? 2 : (currentLevel === 1 ? 1 : 2);
    
    const bubbles: Bubble[] = [];
    const levelColors = [...COLORS].sort(() => random - 0.5).slice(0, colorsCount);
    
    levelColors.forEach(color => {
      for (let i = 0; i < TUBE_CAPACITY; i++) {
        const isBomb = !isDaily && currentLevel >= 10 && Math.random() < 0.1;
        bubbles.push({
          color,
          id: Math.random().toString(36).substr(2, 9),
          bombTimer: isBomb ? 10 + Math.floor(Math.random() * 10) : undefined
        });
      }
    });

    // Shuffle
    for (let i = bubbles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bubbles[i], bubbles[j]] = [bubbles[j], bubbles[i]];
    }

    const tubes: Bubble[][] = [];
    for (let i = 0; i < colorsCount; i++) {
      tubes.push(bubbles.slice(i * TUBE_CAPACITY, (i + 1) * TUBE_CAPACITY));
    }
    for (let i = 0; i < emptyCount; i++) {
      tubes.push([]);
    }

    const obstacles: (TubeObstacle | null)[] = tubes.map((_, idx) => {
      if (!isDaily && currentLevel < 3) return null;
      const rand = Math.random();
      
      // Portal logic
      if ((isDaily || currentLevel >= 12) && rand < 0.15) {
        // Find another tube to connect to
        const otherIdx = Math.floor(Math.random() * tubes.length);
        if (otherIdx !== idx && !obstacles[otherIdx]) {
          const portalId = Math.floor(Math.random() * 1000);
          return { type: 'portal', portalId };
        }
      }

      if (currentLevel >= 3 && currentLevel < 5 && rand < 0.3) return { type: 'mystery' };
      if (currentLevel >= 5 && currentLevel < 7 && rand < 0.2) return { type: idx < colorsCount ? 'one-way-out' : 'one-way-in' };
      if (currentLevel >= 7 && rand < 0.2) return { type: 'locked', value: 5 + Math.floor(currentLevel / 2) };
      return null;
    });

    // Ensure portals are paired
    obstacles.forEach((obs, idx) => {
      if (obs?.type === 'portal' && !obstacles.some((o, i) => i !== idx && o?.type === 'portal' && o.portalId === obs.portalId)) {
        // Find another tube to pair with
        const pairIdx = obstacles.findIndex((o, i) => i !== idx && !o);
        if (pairIdx !== -1) {
          obstacles[pairIdx] = { type: 'portal', portalId: obs.portalId };
        } else {
          obstacles[idx] = null; // Remove if no pair found
        }
      }
    });

    setGameState({
      tubes,
      selectedTubeIndex: null,
      moves: 0,
      score: 0,
      highScore,
      isWon: false,
      history: [],
      level: currentLevel,
      completedSets: 0,
      obstacles,
      powerUps: {
        magnet: 2,
        shield: 2,
        speed: 2,
        gravity: 1
      },
      activeEffects: {
        shield: false,
        speed: 1,
        speedUntil: 0,
        isGravityFlipped: false
      },
      isDailyChallenge: isDaily
    });
    setShowWinModal(false);
    setView('game');
  }, [highScore]);

  // Persist max level
  useEffect(() => {
    localStorage.setItem('bubble-sort-max-level', maxUnlockedLevel.toString());
  }, [maxUnlockedLevel]);

  const checkWin = (tubes: Bubble[][]) => {
    return tubes.every(tube => {
      if (tube.length === 0) return true;
      if (tube.length !== TUBE_CAPACITY) return false;
      const firstColor = tube[0].color;
      return tube.every(bubble => bubble.color === firstColor);
    });
  };

  const handleTubeClick = (index: number) => {
    if (!gameState || gameState.isWon) return;

    const { tubes, selectedTubeIndex, moves, history, score, obstacles, activeEffects } = gameState;
    const obstacle = obstacles[index];
    const isShieldActive = activeEffects.shield;

    if (obstacle?.type === 'locked' && moves < (obstacle.value || 0) && !isShieldActive) {
      playTink(200, 0.2);
      setForbiddenTubeIndex(index);
      setTimeout(() => setForbiddenTubeIndex(null), 500);
      setGameState({ ...gameState, score: Math.max(0, score - 5) });
      return;
    }

    if (selectedTubeIndex === null) {
      if (obstacle?.type === 'one-way-in' && !isShieldActive) {
        playTink(200, 0.2);
        setForbiddenTubeIndex(index);
        setTimeout(() => setForbiddenTubeIndex(null), 500);
        setGameState({ ...gameState, score: Math.max(0, score - 5) });
        return;
      }

      if (tubes[index].length > 0) {
        playTink(600, 0.05);
        setGameState({ ...gameState, selectedTubeIndex: index });
      }
    } else if (selectedTubeIndex === index) {
      playTink(400, 0.05);
      setGameState({ ...gameState, selectedTubeIndex: null });
    } else {
      if (obstacle?.type === 'one-way-out' && !isShieldActive) {
        playTink(200, 0.2);
        setForbiddenTubeIndex(index);
        setTimeout(() => setForbiddenTubeIndex(null), 500);
        setGameState({ ...gameState, score: Math.max(0, score - 5) });
        return;
      }

      const sourceTube = tubes[selectedTubeIndex];
      let targetTubeIndex = index;
      let targetTube = tubes[targetTubeIndex];
      
      // Portal Logic
      if (obstacle?.type === 'portal' && !isShieldActive) {
        const connectedPortalIdx = obstacles.findIndex((o, i) => i !== index && o?.type === 'portal' && o.portalId === obstacle.portalId);
        if (connectedPortalIdx !== -1) {
          targetTubeIndex = connectedPortalIdx;
          targetTube = tubes[targetTubeIndex];
        }
      }

      if (sourceTube.length === 0) {
        setGameState({ ...gameState, selectedTubeIndex: null });
        return;
      }

      const topBubble = sourceTube[sourceTube.length - 1];
      const topColor = topBubble.color;
      let bubblesToMoveCount = 0;
      for (let i = sourceTube.length - 1; i >= 0; i--) {
        if (sourceTube[i].color === topColor) {
          bubblesToMoveCount++;
        } else {
          break;
        }
      }

      const availableSpace = TUBE_CAPACITY - targetTube.length;
      const actualMoveCount = Math.min(bubblesToMoveCount, availableSpace);

      const canMove = 
        actualMoveCount > 0 && 
        (targetTube.length === 0 || targetTube[targetTube.length - 1].color === topColor);

      if (canMove) {
        playTink(1000, 0.15);
        const bubblesToMove = sourceTube.slice(-actualMoveCount);
        
        // Portal: bubbles appear at the bottom if it's a portal move? 
        // User said: "Dropping a bubble into one makes it instantly appear at the bottom of the other."
        // That means we need to unshift if it's a portal move.
        const isPortalMove = targetTubeIndex !== index;

        const newTubes = tubes.map((t, i) => {
          if (i === selectedTubeIndex) return t.slice(0, -actualMoveCount);
          if (i === targetTubeIndex) {
            if (isPortalMove) {
              return [...bubblesToMove, ...t];
            } else {
              return [...t, ...bubblesToMove];
            }
          }
          return t;
        });

        // Decrement Bomb Timers
        let bombExploded = false;
        const processedTubes = newTubes.map(tube => 
          tube.map(bubble => {
            if (bubble.bombTimer !== undefined) {
              const newTimer = bubble.bombTimer - 1;
              if (newTimer <= 0) bombExploded = true;
              return { ...bubble, bombTimer: newTimer };
            }
            return bubble;
          })
        );

        if (bombExploded) {
          playTink(100, 0.5);
          // Scramble the tube where it exploded? 
          // For simplicity, let's just scramble all tubes slightly or penalize score heavily.
          // User said: "explode and scramble the tube they are in."
          // Let's find which tube had the bomb.
          const finalTubes = processedTubes.map(tube => {
            if (tube.some(b => b.bombTimer !== undefined && b.bombTimer <= 0)) {
              return [...tube].sort(() => Math.random() - 0.5);
            }
            return tube;
          });

          setGameState({
            ...gameState,
            tubes: finalTubes,
            selectedTubeIndex: null,
            moves: moves + 1,
            score: Math.max(0, score - 100),
            history: [...history, { tubes, score }].slice(-5),
            lastBombExploded: true
          });
          return;
        }

        // Combo Logic
        const now = Date.now();
        let newCombo = combo;
        if (now - lastMoveTime < 2000) {
          newCombo += 1;
        } else {
          newCombo = 0;
        }
        setCombo(newCombo);
        setLastMoveTime(now);

        let moveScore = 10;
        if (newCombo > 1) {
          moveScore += Math.min(newCombo * 5, 50); // Combo bonus
        }
        
        let newScore = score + moveScore;
        const targetTubeAfter = isPortalMove ? [...bubblesToMove, ...targetTube] : [...targetTube, ...bubblesToMove];
        if (targetTubeAfter.length === TUBE_CAPACITY && targetTubeAfter.every(b => b.color === topColor)) {
          newScore += 100;
          playTink(1500, 0.2);
        }

        const isWon = checkWin(processedTubes);
        if (isWon) {
          const levelBonus = 500 + (level * 100);
          newScore += levelBonus;
          setTimeout(() => playTink(1200, 0.5), 300);
          setShowWinModal(true);
          
          if (newScore > highScore) {
            setHighScore(newScore);
            localStorage.setItem('bubble-sort-high-score', newScore.toString());
          }

          if (level === maxUnlockedLevel) {
            setMaxUnlockedLevel(level + 1);
          }
        }

        setGameState({
          ...gameState,
          tubes: processedTubes,
          selectedTubeIndex: null,
          moves: moves + 1,
          score: newScore,
          isWon,
          history: [...history, { tubes, score }].slice(-5),
          activeEffects: { ...activeEffects, shield: false }
        });
      } else {
        if (tubes[index].length > 0) {
          if (obstacles[index]?.type !== 'one-way-in' || isShieldActive) {
            playTink(600, 0.05);
            setGameState({ ...gameState, selectedTubeIndex: index });
          } else {
            playTink(200, 0.2);
            setForbiddenTubeIndex(index);
            setTimeout(() => setForbiddenTubeIndex(null), 500);
            setGameState({ ...gameState, score: Math.max(0, score - 5) });
          }
        } else {
          playTink(300, 0.1);
          setForbiddenTubeIndex(index);
          setTimeout(() => setForbiddenTubeIndex(null), 500);
          setGameState({ ...gameState, selectedTubeIndex: null, score: Math.max(0, score - 5) });
        }
      }
    }
  };

  const undoMove = () => {
    if (!gameState || gameState.history.length === 0 || gameState.isWon) return;
    playTink(500, 0.1);
    const newHistory = [...gameState.history];
    const { tubes: previousTubes, score: previousScore } = newHistory.pop()!;
    setGameState({
      ...gameState,
      tubes: previousTubes,
      history: newHistory,
      moves: gameState.moves - 1,
      score: Math.max(0, previousScore - 20), // Penalty for undo
      selectedTubeIndex: null
    });
  };

  const usePowerUp = (type: PowerUpType) => {
    if (!gameState || gameState.isWon || gameState.powerUps[type] <= 0) return;

    const { tubes, powerUps, activeEffects, selectedTubeIndex } = gameState;
    
    if (type === 'magnet') {
      if (selectedTubeIndex === null) {
        playTink(200, 0.2);
        return;
      }
      
      const targetTubeInitial = tubes[selectedTubeIndex];
      if (targetTubeInitial.length >= TUBE_CAPACITY) return;
      
      const topBubble = targetTubeInitial.length > 0 ? targetTubeInitial[targetTubeInitial.length - 1] : null;
      if (!topBubble) return;
      const topColor = topBubble.color;

      let moved = false;
      let currentTargetTube = [...targetTubeInitial];
      
      const intermediateTubes = tubes.map((t, i) => {
        if (i === selectedTubeIndex) return t;
        if (t.length > 0 && t[t.length - 1].color === topColor && currentTargetTube.length < TUBE_CAPACITY) {
          moved = true;
          const bubble = t[t.length - 1];
          currentTargetTube.push(bubble);
          return t.slice(0, -1);
        }
        return t;
      });

      if (moved) {
        const finalTubes = intermediateTubes.map((t, i) => i === selectedTubeIndex ? currentTargetTube : t);
        playTink(1200, 0.3);
        setGameState({
          ...gameState,
          tubes: finalTubes,
          powerUps: { ...powerUps, magnet: powerUps.magnet - 1 }
        });
      }
    } else if (type === 'shield') {
      playTink(800, 0.2);
      setGameState({
        ...gameState,
        powerUps: { ...powerUps, shield: powerUps.shield - 1 },
        activeEffects: { ...activeEffects, shield: true }
      });
    } else if (type === 'speed') {
      playTink(1000, 0.2);
      setGameState({
        ...gameState,
        powerUps: { ...powerUps, speed: powerUps.speed - 1 },
        activeEffects: { ...activeEffects, speed: 2, speedUntil: Date.now() + 15000 }
      });
    } else if (type === 'gravity') {
      playTink(1200, 0.4);
      const flippedTubes = tubes.map(tube => [...tube].reverse());
      setGameState({
        ...gameState,
        tubes: flippedTubes,
        powerUps: { ...powerUps, gravity: powerUps.gravity - 1 },
        activeEffects: { ...activeEffects, isGravityFlipped: !activeEffects.isGravityFlipped }
      });
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (gameState && gameState.activeEffects.speedUntil > 0 && Date.now() > gameState.activeEffects.speedUntil) {
        setGameState({
          ...gameState,
          activeEffects: { ...gameState.activeEffects, speed: 1, speedUntil: 0 }
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState]);

  const nextLevel = () => {
    const next = level + 1;
    setLevel(next);
    initGame(next);
  };

  const isBallPopped = (tubeIdx: number, ballIdx: number) => {
    if (!gameState || gameState.selectedTubeIndex !== tubeIdx) return false;
    const tube = gameState.tubes[tubeIdx];
    const topColor = tube[tube.length - 1].color;
    for (let i = tube.length - 1; i >= ballIdx; i--) {
      if (tube[i].color !== topColor) return false;
    }
    return true;
  };

  const renderMenu = () => {
    const levels = Array.from({ length: 20 }, (_, i) => i + 1);
    
    return (
      <div className="flex-1 w-full flex flex-col items-center p-6 gap-8 overflow-y-auto no-scrollbar z-10">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mt-12 w-full flex flex-col items-center"
        >
          <div className="flex justify-between w-full max-w-md items-center mb-6">
            <div className="w-10" />
            <h1 className="text-5xl font-black tracking-tighter text-white italic drop-shadow-[0_0_20px_rgba(6,182,212,0.5)]">
              BUBBLE<br/>SORT
            </h1>
            <button 
              onClick={() => setShowHelp(true)}
              className="p-3 rounded-2xl bg-white/5 border border-white/10 text-cyan-400 hover:bg-white/10 transition-all shadow-lg"
            >
              <HelpCircle size={24} />
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-2 text-cyan-400 font-black text-sm tracking-widest bg-cyan-500/10 px-4 py-2 rounded-full border border-cyan-500/20">
            <Trophy size={16} fill="currentColor" />
            <span>BEST SCORE: {highScore}</span>
          </div>
        </motion.div>

        {/* Legend / Quick Guide */}
        <div className="w-full max-w-md glass-panel rounded-[32px] p-6 grid grid-cols-2 gap-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.2)]">
              <ArrowUpFromLine size={20} />
            </div>
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-tight">Exit<br/>Only</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
              <ArrowDownToLine size={20} />
            </div>
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-tight">Entry<br/>Only</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
              <Lock size={20} />
            </div>
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-tight">Locked<br/>Tube</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-600 flex items-center justify-center text-slate-400">
              <span className="font-black text-lg">?</span>
            </div>
            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-tight">Mystery<br/>Bubble</span>
          </div>
        </div>

        <div className="w-full max-w-md flex flex-col gap-4">
          <button 
            onClick={() => initGame(1, true)}
            className="w-full py-6 px-6 rounded-[32px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black uppercase tracking-[0.2em] shadow-2xl shadow-cyan-500/30 transition-all active:scale-95 flex items-center justify-center gap-4 border border-white/20"
          >
            <Calendar size={28} />
            Daily Challenge
          </button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => initGame(maxUnlockedLevel)}
            className="w-full py-6 bg-white/5 border border-white/10 rounded-[32px] font-black text-xl tracking-[0.2em] text-white shadow-xl flex items-center justify-center gap-4 hover:bg-white/10 transition-all"
          >
            PLAY NOW
            <Play size={24} fill="currentColor" />
          </motion.button>
        </div>

        <div className="flex items-center gap-4 w-full max-w-md">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] font-black text-slate-500 tracking-[0.3em] uppercase">Select Level</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <div className="grid grid-cols-4 gap-4 w-full max-w-md pb-20">
          {levels.map((lvl) => {
            const isUnlocked = lvl <= maxUnlockedLevel;
            const isCurrent = lvl === maxUnlockedLevel;
            
            return (
              <motion.button
                key={lvl}
                whileHover={isUnlocked ? { scale: 1.1, y: -5 } : {}}
                whileTap={isUnlocked ? { scale: 0.9 } : {}}
                onClick={() => isUnlocked && (setLevel(lvl), initGame(lvl))}
                className={`
                  aspect-square rounded-3xl flex items-center justify-center relative
                  transition-all duration-300
                  ${isUnlocked 
                    ? 'bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 shadow-xl' 
                    : 'bg-slate-950/50 border border-white/5 opacity-40'}
                  ${isCurrent ? 'ring-2 ring-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.3)]' : ''}
                `}
              >
                {isUnlocked ? (
                  <span className={`text-xl font-black ${isCurrent ? 'text-cyan-400' : 'text-white'}`}>{lvl}</span>
                ) : (
                  <Lock size={18} className="text-slate-700" />
                )}

                {isCurrent && isUnlocked && (
                  <div className="absolute -top-1 -right-1 bg-cyan-500 rounded-full p-1 shadow-lg">
                    <Star size={10} fill="white" className="text-white" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderGame = () => {
    if (!gameState) return null;

    return (
      <>
        {/* Mobile Header */}
        <header className="w-full px-6 py-4 flex justify-between items-center glass-panel border-b-0 rounded-b-3xl z-40 shadow-2xl shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setView('menu')}
              className="p-2 rounded-xl bg-slate-800 active:scale-95 transition-transform"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-cyan-500">Level {level}</span>
              </div>
              <h1 className="text-lg font-black tracking-tight">GAMEPLAY</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-mono text-slate-400 leading-none">SCORE</span>
              <span className="text-lg font-black text-white leading-none">{gameState.score}</span>
            </div>
            <div className="flex items-center gap-1.5 ml-2">
              <button 
                onClick={undoMove}
                disabled={gameState.history.length === 0}
                className={`p-2 rounded-xl transition-all ${gameState.history.length > 0 ? 'bg-slate-800 text-white active:scale-95' : 'bg-slate-800/50 text-slate-600 cursor-not-allowed'}`}
                title="Undo (Max 5 steps)"
              >
                <Undo2 size={20} />
              </button>
              <button 
                onClick={() => initGame(level)}
                className="p-2 rounded-xl bg-slate-800 active:scale-95 transition-transform"
                title="Reset Level"
              >
                <RotateCcw size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Main Game Area */}
        <main className="flex-1 w-full flex flex-col items-center justify-start px-6 pb-6 pt-4 gap-6 overflow-y-auto no-scrollbar relative z-10">
          {/* Combo Display */}
          <AnimatePresence>
            {combo > 1 && (
              <motion.div 
                initial={{ scale: 0.5, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 1.5, opacity: 0, y: -20 }}
                className="fixed top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none"
              >
                <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-6 py-2 rounded-full font-black italic text-2xl shadow-[0_0_40px_rgba(234,179,8,0.6)] border-2 border-white/20">
                  {combo}X COMBO!
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Power-ups Bar */}
          <div className="w-full max-w-md glass-panel rounded-[32px] p-4 flex justify-between items-center shadow-2xl">
            <button 
              onClick={() => usePowerUp('magnet')}
              disabled={gameState.powerUps.magnet <= 0 || gameState.selectedTubeIndex === null}
              className={`flex flex-col items-center gap-1.5 transition-all ${gameState.powerUps.magnet > 0 ? 'text-cyan-400' : 'text-slate-600 opacity-50'}`}
            >
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 relative shadow-inner">
                <Magnet size={24} />
                <span className="absolute -top-2 -right-2 bg-cyan-500 text-black text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-slate-900">{gameState.powerUps.magnet}</span>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">Magnet</span>
            </button>

            <button 
              onClick={() => usePowerUp('shield')}
              disabled={gameState.powerUps.shield <= 0 || gameState.activeEffects.shield}
              className={`flex flex-col items-center gap-1.5 transition-all ${gameState.powerUps.shield > 0 ? 'text-emerald-400' : 'text-slate-600 opacity-50'} ${gameState.activeEffects.shield ? 'ring-2 ring-emerald-500 rounded-2xl p-0.5' : ''}`}
            >
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 relative shadow-inner">
                <Shield size={24} />
                <span className="absolute -top-2 -right-2 bg-emerald-500 text-black text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-slate-900">{gameState.powerUps.shield}</span>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">Shield</span>
            </button>

            <button 
              onClick={() => usePowerUp('speed')}
              disabled={gameState.powerUps.speed <= 0 || gameState.activeEffects.speedUntil > 0}
              className={`flex flex-col items-center gap-1.5 transition-all ${gameState.powerUps.speed > 0 ? 'text-yellow-400' : 'text-slate-600 opacity-50'} ${gameState.activeEffects.speedUntil > 0 ? 'ring-2 ring-yellow-500 rounded-2xl p-0.5' : ''}`}
            >
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 relative shadow-inner">
                <Zap size={24} />
                <span className="absolute -top-2 -right-2 bg-yellow-500 text-black text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-slate-900">{gameState.powerUps.speed}</span>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">
                {gameState.activeEffects.speedUntil > 0 ? `${Math.ceil((gameState.activeEffects.speedUntil - Date.now()) / 1000)}s` : 'Speed'}
              </span>
            </button>

            <button 
              onClick={() => usePowerUp('gravity')}
              disabled={gameState.powerUps.gravity <= 0}
              className={`flex flex-col items-center gap-1.5 transition-all ${gameState.powerUps.gravity > 0 ? 'text-purple-400' : 'text-slate-600 opacity-50'}`}
            >
              <div className="p-3 bg-white/5 rounded-2xl border border-white/10 relative shadow-inner">
                <ArrowDownUp size={24} />
                <span className="absolute -top-2 -right-2 bg-purple-500 text-black text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg border-2 border-slate-900">{gameState.powerUps.gravity}</span>
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">Gravity</span>
            </button>
          </div>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-16 max-w-md py-8">
            {gameState.tubes.map((tube, tubeIdx) => {
              const obstacle = gameState.obstacles[tubeIdx];
              const isLocked = obstacle?.type === 'locked' && gameState.moves < (obstacle.value || 0);
              const movesToUnlock = isLocked ? (obstacle.value || 0) - gameState.moves : 0;

              return (
                <div 
                  key={tubeIdx}
                  onClick={() => handleTubeClick(tubeIdx)}
                  className="relative pt-12"
                >
                  {/* Obstacle Labels */}
                  {obstacle && (
                    <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-20">
                      {obstacle.type === 'locked' && isLocked && (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="bg-red-500/20 backdrop-blur-md text-red-400 text-[10px] font-black px-2 py-1.5 rounded-xl border border-red-500/40 flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                        >
                          <Lock size={12} fill="currentColor" className="opacity-80" />
                          <span>{movesToUnlock}</span>
                        </motion.div>
                      )}
                      {obstacle.type === 'one-way-in' && (
                        <motion.div 
                          initial={{ y: 5, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="bg-emerald-500/20 backdrop-blur-md text-emerald-400 text-[10px] font-black px-2.5 py-1.5 rounded-xl border border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)] flex items-center gap-1.5"
                        >
                          <ArrowDownToLine size={12} />
                          <span className="tracking-tighter">ENTRY</span>
                        </motion.div>
                      )}
                      {obstacle.type === 'one-way-out' && (
                        <motion.div 
                          initial={{ y: 5, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="bg-orange-500/20 backdrop-blur-md text-orange-400 text-[10px] font-black px-2.5 py-1.5 rounded-xl border border-orange-500/40 shadow-[0_0_15px_rgba(249,115,22,0.2)] flex items-center gap-1.5"
                        >
                          <ArrowUpFromLine size={12} />
                          <span className="tracking-tighter">EXIT</span>
                        </motion.div>
                      )}
                      {obstacle.type === 'portal' && (
                        <motion.div 
                          initial={{ y: 5, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          className="bg-cyan-500/20 backdrop-blur-md text-cyan-400 text-[10px] font-black px-2.5 py-1.5 rounded-xl border border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.2)] flex items-center gap-1.5"
                        >
                          <Orbit size={12} />
                          <span className="tracking-tighter">PORTAL</span>
                        </motion.div>
                      )}
                    </div>
                  )}

                  {/* Tube */}
                  <motion.div 
                    animate={forbiddenTubeIndex === tubeIdx ? { x: [0, -5, 5, -5, 5, 0] } : {}}
                    transition={{ duration: 0.4 }}
                    className={`
                      w-16 h-44 md:w-20 md:h-56 
                      rounded-b-[40px] rounded-t-xl
                      flex flex-col-reverse items-center p-1.5
                      transition-all duration-300 relative tube-glass
                      ${isLocked ? 'opacity-40 grayscale' : ''}
                      ${gameState.selectedTubeIndex === tubeIdx ? 'ring-4 ring-cyan-500/40 border-cyan-500/50 -translate-y-2' : 'active:scale-95'}
                      ${forbiddenTubeIndex === tubeIdx ? 'ring-4 ring-red-500/40 border-red-500/50' : ''}
                    `}
                  >
                    <AnimatePresence mode="popLayout">
                      {tube.map((bubble, ballIdx) => {
                        const popped = isBallPopped(tubeIdx, ballIdx);
                        const isMystery = obstacle?.type === 'mystery' && ballIdx < tube.length - 1;
                        
                        return (
                          <motion.div
                            key={bubble.id}
                            layoutId={`ball-${bubble.id}`}
                            initial={false}
                            animate={{ 
                              y: popped ? -80 : 0,
                              scale: 1,
                              opacity: 1
                            }}
                            transition={{ 
                              type: "spring", 
                              stiffness: (300 + (level * 10)) * (gameState.activeEffects.speed || 1),
                              damping: 25,
                              layout: { duration: 0.3 / (gameState.activeEffects.speed || 1) }
                            }}
                            className="w-13 h-13 md:w-16 md:h-16 rounded-full mb-1 relative shadow-xl z-10"
                            style={{ 
                              backgroundColor: isMystery ? '#1e293b' : bubble.color,
                              boxShadow: `inset -4px -4px 8px rgba(0,0,0,0.4), inset 4px 4px 8px rgba(255,255,255,0.2)`
                            }}
                          >
                            {!isMystery && <div className="absolute top-2 left-3 w-4 h-4 bg-white/20 rounded-full blur-[1px]" />}
                            {isMystery && <div className="absolute inset-0 flex items-center justify-center text-slate-600 font-black text-xl">?</div>}
                            {bubble.bombTimer !== undefined && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Bomb size={20} className="text-black/30" />
                                <span className="absolute text-[12px] font-black text-white drop-shadow-md">{bubble.bombTimer}</span>
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>

                    {/* Forbidden Overlay */}
                    {forbiddenTubeIndex === tubeIdx && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                        <motion.div 
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.5, opacity: 0 }}
                          className="w-14 h-14 bg-red-500/20 backdrop-blur-sm rounded-full flex items-center justify-center border border-red-500/50 shadow-2xl text-red-500"
                        >
                          <Ban size={32} strokeWidth={3} />
                        </motion.div>
                      </div>
                    )}

                    {/* Locked Overlay */}
                    {isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-10 h-10 bg-slate-900/80 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 shadow-2xl">
                          <Lock size={20} className="text-slate-400" />
                        </div>
                      </div>
                    )}
                  </motion.div>

                  {/* Selection Indicator */}
                  {gameState.selectedTubeIndex === tubeIdx && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                      <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* Mobile Bottom Navigation/Actions */}
        <footer className="w-full p-6 bg-slate-900/40 border-t border-white/5 flex justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="bg-slate-800/50 px-3 py-1 rounded-lg border border-white/5">
              <span className="text-[10px] font-mono text-slate-500">MOVES: </span>
              <span className="text-xs font-bold">{gameState.moves}</span>
            </div>
          </div>
          
          <button 
            onClick={undoMove}
            disabled={gameState.history.length === 0 || gameState.isWon}
            className="flex flex-col items-center gap-1 text-slate-400 disabled:opacity-20 active:scale-90 transition-transform"
          >
            <div className="p-3 bg-slate-800 rounded-2xl">
              <Undo2 size={24} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Undo</span>
          </button>
          
          <button 
            onClick={() => initGame(level)}
            className="flex flex-col items-center gap-1 text-slate-400 active:scale-90 transition-transform"
          >
            <div className="p-3 bg-slate-800 rounded-2xl">
              <RotateCcw size={24} />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">Reset</span>
          </button>
        </footer>

        {/* Win Modal */}
        <AnimatePresence>
          {showWinModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4"
            >
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="bg-slate-900 border-t border-white/10 p-8 rounded-t-[40px] w-full max-w-md text-center shadow-2xl pb-12"
              >
                <div className="w-24 h-24 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-12 shadow-xl shadow-orange-500/20">
                  <Trophy className="text-white" size={48} />
                </div>
                <h2 className="text-4xl font-black mb-2 tracking-tight">LEVEL CLEAR!</h2>
                <div className="flex justify-center gap-8 mb-8">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Score</span>
                    <span className="text-2xl font-black text-white">{gameState.score}</span>
                  </div>
                  <div className="flex flex-col border-l border-white/10 pl-8">
                    <span className="text-[10px] text-slate-500 font-bold uppercase">Moves</span>
                    <span className="text-2xl font-black text-white">{gameState.moves}</span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={nextLevel}
                    className="w-full py-5 bg-cyan-500 rounded-2xl font-black text-xl hover:bg-cyan-400 active:scale-95 transition-all flex items-center justify-center gap-3 shadow-lg shadow-cyan-500/30"
                  >
                    NEXT LEVEL
                    <Play size={24} fill="currentColor" />
                  </button>
                  <button 
                    onClick={() => setView('menu')}
                    className="w-full py-4 bg-slate-800 rounded-2xl font-bold text-slate-300 hover:bg-slate-700 active:scale-95 transition-all"
                  >
                    BACK TO MENU
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  };

  return (
    <div className="relative w-full h-[100dvh] flex flex-col items-center text-white font-sans overflow-hidden select-none">
      <div className="atmosphere">
        <div className="blob top-[-10%] left-[-10%]" />
        <div className="blob blob-2 bottom-[-10%] right-[-10%]" />
      </div>
      
      {/* Help Modal */}
      <AnimatePresence>
        {showHelp && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-white/10 rounded-[32px] w-full max-w-md p-8 relative overflow-hidden"
            >
              <button 
                onClick={() => setShowHelp(false)}
                className="absolute top-6 right-6 p-2 bg-slate-800 rounded-full text-slate-400"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-cyan-500/20 rounded-2xl text-cyan-400">
                  <Info size={24} />
                </div>
                <h2 className="text-2xl font-black tracking-tight">HOW TO PLAY</h2>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-orange-500/20 border border-orange-500/40 rounded-2xl flex items-center justify-center text-orange-400 shadow-lg shadow-orange-500/10">
                    <ArrowUpFromLine size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-orange-400 uppercase tracking-tight">Exit Only Tube</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">You can only take bubbles OUT of this tube. Dropping bubbles inside is disabled.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
                    <ArrowDownToLine size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-emerald-400 uppercase tracking-tight">Entry Only Tube</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">You can only drop bubbles INTO this tube. Taking bubbles out is disabled.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-red-500/20 border border-red-500/40 rounded-2xl flex items-center justify-center text-red-400 shadow-lg shadow-red-500/10">
                    <Lock size={24} fill="currentColor" className="opacity-80" />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-400 uppercase tracking-tight">Locked Tube</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">This tube is sealed. Make the required number of moves in other tubes to unlock it.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-slate-800 border border-slate-600 rounded-2xl flex items-center justify-center text-slate-400">
                    <span className="font-black text-xl">?</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-300 uppercase tracking-tight">Mystery Bubbles</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">Hidden bubbles reveal their true color only when they reach the top of the tube.</p>
                  </div>
                </div>

                <div className="h-px bg-white/10 my-2" />
                <h2 className="text-cyan-400 font-black text-sm uppercase tracking-widest mb-2">Power-Ups</h2>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-cyan-500/20 border border-cyan-500/40 rounded-2xl flex items-center justify-center text-cyan-400">
                    <Magnet size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-cyan-400 uppercase tracking-tight">Magnet</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">Select a tube with bubbles, then use Magnet to pull all bubbles of that color from other tubes.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-center text-emerald-400">
                    <Shield size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-emerald-400 uppercase tracking-tight">Shield</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">Ignores all tube restrictions (Locked, Entry Only, Exit Only) for your next move.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-yellow-500/20 border border-yellow-500/40 rounded-2xl flex items-center justify-center text-yellow-400">
                    <Zap size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-yellow-400 uppercase tracking-tight">Speed</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">Doubles the animation speed for 15 seconds. Great for fast-paced sorting!</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-purple-500/20 border border-purple-500/40 rounded-2xl flex items-center justify-center text-purple-400">
                    <ArrowDownUp size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-purple-400 uppercase tracking-tight">Gravity Flip</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">Reverses the order of all bubbles in all tubes. Bottom becomes top!</p>
                  </div>
                </div>

                <div className="h-px bg-white/10 my-2" />
                <h2 className="text-cyan-400 font-black text-sm uppercase tracking-widest mb-2">Special Obstacles</h2>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-cyan-500/20 border border-cyan-500/40 rounded-2xl flex items-center justify-center text-cyan-400">
                    <Orbit size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-cyan-400 uppercase tracking-tight">Portal Tubes</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">Connected tubes! Dropping a bubble into one makes it appear at the bottom of the other.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 shrink-0 bg-red-500/20 border border-red-500/40 rounded-2xl flex items-center justify-center text-red-400">
                    <Bomb size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-red-400 uppercase tracking-tight">Timed Bombs</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">Bubbles with a countdown. If they explode, they scramble the tube they are in!</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowHelp(false)}
                className="w-full mt-8 py-4 bg-slate-800 rounded-2xl font-bold text-white active:scale-95 transition-all"
              >
                GOT IT!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {view === 'menu' ? renderMenu() : renderGame()}
    </div>
  );
}
