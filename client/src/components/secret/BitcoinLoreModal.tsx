import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTheme } from '@/contexts/ThemeContext';
import { toast } from 'sonner';

type Question = {
  id: string;
  prompt: string;
  answer: string;
  choices?: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
};

const baseQuestions: Question[] = [
  { id: 'q1', prompt: 'What hash function secures Bitcoin blocks?', answer: 'SHA-256', choices: ['SHA-1', 'SHA-256', 'Keccak', 'Scrypt'] },
  { id: 'q2', prompt: 'Target Bitcoin block interval?', answer: '10 minutes', choices: ['1 minute', '5 minutes', '10 minutes', '60 minutes'] },
  { id: 'q3', prompt: 'Name of the longest-chain rule adjustment every 2016 blocks.', answer: 'Difficulty adjustment' },
  { id: 'q4', prompt: 'SegWit introduced which witness version?', answer: 'v0', choices: ['v0', 'v1', 'v2', 'v3'] },
  { id: 'q5', prompt: 'What BIP defined mnemonic seed phrases?', answer: 'BIP39', choices: ['BIP32', 'BIP39', 'BIP44', 'BIP174'] },
  { id: 'q6', prompt: 'ASICs replaced what earlier mining hardware phase?', answer: 'GPU' },
  { id: 'q7', prompt: 'Nonce size in the block header?', answer: '32-bit', choices: ['16-bit', '24-bit', '32-bit', '64-bit'] },
  { id: 'q8', prompt: 'Block subsidy after the fourth halving?', answer: '3.125 BTC', choices: ['6.25 BTC', '3.125 BTC', '1.5625 BTC', '12.5 BTC'] },
  { id: 'q9', prompt: 'Lightning payments use what kind of contracts?', answer: 'HTLC', choices: ['Covenant', 'HTLC', 'Taproot', 'UTXO'] },
  { id: 'q10', prompt: 'Taproot was activated in which year?', answer: '2021', choices: ['2017', '2019', '2021', '2023'] },
  { id: 'q11', prompt: 'Standard transaction script template is called?', answer: 'P2PKH', choices: ['P2SH', 'P2PKH', 'P2TR', 'P2WPKH'] },
  { id: 'q12', prompt: 'What is merged mining with Bitcoin for Namecoin called?', answer: 'AuxPoW' },
  { id: 'q13', prompt: 'Compact block filter standard?', answer: 'BIP157', choices: ['BIP37', 'BIP141', 'BIP157', 'BIP174'] },
  { id: 'q14', prompt: 'Who authored Bitcoin?', answer: 'Satoshi Nakamoto' },
  { id: 'q15', prompt: 'What does a Bitaxe optimize: ASIC, FPGA, or CPU?', answer: 'ASIC', choices: ['CPU', 'FPGA', 'ASIC', 'GPU'] },
  { id: 'q16', prompt: 'Block version bits signal what softfork mechanism?', answer: 'BIP9' },
  { id: 'q17', prompt: 'Typical voltage rail tuned on a BM1370 miner?', answer: 'Vcore', choices: ['Vio', 'Vcore', 'Vmem', 'Vpll'] },
  { id: 'q18', prompt: 'Chainwork compares nodes based on what metric?', answer: 'Cumulative proof of work' },
  { id: 'q19', prompt: 'Schnorr signatures use which curve?', answer: 'secp256k1', choices: ['P-256', 'ed25519', 'secp256k1', 'Curve25519'] },
  { id: 'q20', prompt: 'What is the witness discount factor for block weight?', answer: '4', choices: ['2', '3', '4', '8'] },
  { id: 'q21', prompt: 'Header field that targets difficulty?', answer: 'Bits' },
  { id: 'q22', prompt: 'A valid block hash must be below the...', answer: 'Target' },
  { id: 'q23', prompt: 'Common fan control target metric on miners?', answer: 'Temperature' },
  { id: 'q24', prompt: 'Lightning node channel states are updated via...', answer: 'Commitment transactions' },
  { id: 'q25', prompt: 'What does ASIC stand for?', answer: 'Application-Specific Integrated Circuit' },
  { id: 'q26', prompt: 'How many bytes in a block hash output?', answer: '32 bytes', choices: ['16 bytes', '24 bytes', '32 bytes', '64 bytes'] },
  { id: 'q27', prompt: 'Bitcoin supply cap?', answer: '21 million', choices: ['10 million', '18 million', '21 million', '42 million'] },
  { id: 'q28', prompt: 'What is the mempool?', answer: 'Pending transaction pool' },
  { id: 'q29', prompt: 'Pool payout method that pays per share?', answer: 'PPS', choices: ['PPLNS', 'SOLO', 'PPS', 'FPPS'] },
  { id: 'q30', prompt: 'What protects against transaction malleability?', answer: 'SegWit' },
  { id: 'q31', prompt: 'A nonce wraparound forces miners to vary what field next?', answer: 'Extra nonce in coinbase' },
  { id: 'q32', prompt: 'What transport does Stratum V2 improve?', answer: 'Mining protocol' },
  { id: 'q33', prompt: 'What is OCP PSU commonly used for?', answer: 'Powering miners' },
  { id: 'q34', prompt: 'ECDSA signature parts?', answer: 'r and s', choices: ['x and y', 'r and s', 'h and k', 'p and q'] },
  { id: 'q35', prompt: 'What is block weight limit?', answer: '4 million weight units' },
  { id: 'q36', prompt: 'Bitcoin scripts are stack-based and...', answer: 'Non-Turing-complete', choices: ['Turing-complete', 'Non-Turing-complete', 'Functional', 'Declarative'] },
  { id: 'q37', prompt: 'What is an orphan block?', answer: 'Block not on best chain' },
  { id: 'q38', prompt: 'Nonce tuning and frequency scaling change what metric?', answer: 'Hashrate' },
  { id: 'q39', prompt: 'Lightning invoices use what encoding?', answer: 'Bech32' },
  { id: 'q40', prompt: 'What fan curve risk do you avoid by capping RPM?', answer: 'Overheating or VRM stress', choices: ['Overvoltage', 'Overheating or VRM stress', 'Network loss', 'Clock skew'] },
  { id: 'q41', prompt: 'What is UTXO short for?', answer: 'Unspent Transaction Output' },
  { id: 'q42', prompt: 'What does RBF stand for?', answer: 'Replace-By-Fee' },
  { id: 'q43', prompt: 'Chain splits are resolved by what rule?', answer: 'Most work chain wins' },
  { id: 'q44', prompt: 'What is the purpose of a mining pool?', answer: 'Variance reduction' },
  { id: 'q45', prompt: 'Cooling design that pushes air front-to-back is called?', answer: 'Front-to-back airflow' },
  { id: 'q46', prompt: 'What is the coinbase transaction?', answer: 'First transaction rewarding the miner' },
  { id: 'q47', prompt: 'What is a difficulty epoch?', answer: '2016-block period' },
  { id: 'q48', prompt: 'Which BIP defined P2SH?', answer: 'BIP16' },
  { id: 'q49', prompt: 'Purpose of a VRM on a miner?', answer: 'Regulate voltage to the ASIC' },
  { id: 'q50', prompt: 'Taproot combines Schnorr with what tree structure?', answer: 'Merkle tree' },
  { id: 'q51', prompt: 'What is the measurement unit for miner energy efficiency?', answer: 'Joules per terahash', choices: ['W/GH', 'J/TH', 'kWh/block', 'V/A'] },
  { id: 'q52', prompt: 'How do nodes agree on the UTXO set?', answer: 'By validating and following the most-work chain' },
  { id: 'q53', prompt: 'What is the genesis block reward?', answer: '50 BTC' },
  { id: 'q54', prompt: 'Lightning channel backups often store...', answer: 'Channel state blobs' },
  { id: 'q55', prompt: 'How is block time variance reduced?', answer: 'By hashrate following difficulty' },
  { id: 'q56', prompt: 'Common hashboard failure symptom?', answer: 'Missing chips or low hashrate' },
  { id: 'q57', prompt: 'What is a stratum share?', answer: 'Proof-of-work below pool target' },
  { id: 'q58', prompt: 'What does compact blocks reduce?', answer: 'Bandwidth for block relay' },
  { id: 'q59', prompt: 'Nonce is incremented, extra nonce lives in...', answer: 'Coinbase script' },
  { id: 'q60', prompt: 'What does hodl originally mean?', answer: 'Hold (misspelling of hold)' },
];

const generatedQuestions: Question[] = Array.from({ length: 150 }, (_, i) => {
  const n = i + 61;
  const topic = i % 5;
  const prompts = [
    `Nerd check ${n}: What keeps block production near 10 minutes?`,
    `Nerd check ${n}: Which encoding is used for native segwit addresses?`,
    `Nerd check ${n}: What metric do miners tune to improve efficiency?`,
    `Nerd check ${n}: What consensus rule wins in a fork?`,
    `Nerd check ${n}: What protects against malleability?`,
  ];
  const answers = ['Difficulty adjustment', 'Bech32', 'Joules per terahash', 'Most work chain', 'SegWit'];
  return {
    id: `g${n}`,
    prompt: prompts[topic],
    answer: answers[topic],
  };
});

const questionBank: Question[] = [...baseQuestions, ...generatedQuestions];

const baseFacts = [
  'Bitcoin adjusts difficulty every 2016 blocks to target ~10 minute blocks.',
  'Taproot enables key and script path spending with Schnorr signatures.',
  'A Bitaxe-class miner optimizes ASIC performance by careful voltage/frequency tuning.',
  'Lightning Network uses HTLCs to route payments trustlessly.',
  'Block weight caps SegWit blocks at 4 million weight units.',
  'Mining pools lower variance by sharing work and paying per share or per block.',
  'Stratum V2 reduces bandwidth and lets miners select their own templates.',
  'ASIC efficiency is often measured in J/TH—the lower, the better.',
  'UTXO model simplifies parallel validation and avoids account-style global state.',
  'Nonce wraparound forces miners to change the extra nonce or block template.',
  'Schnorr signatures allow key aggregation and batch validation.',
  'Cold ambient air and good ducting often beat exotic cooling for small rigs.',
  'Hashrate spikes without a difficulty increase yield shorter block times temporarily.',
  'Mempool policies (like RBF) are local; consensus rules are global.',
  'Difficulty only moves based on the last 2016 blocks, not on projected hash.',
  'P2PKH to P2SH to P2WPKH to P2TR is the rough evolution of script templates.',
  'Coinbase transactions can encode metadata but must respect consensus limits.',
  'VRMs with good thermal pads and airflow last longer under high load.',
  'Fee estimation is probabilistic; overpaying is safer but wastes sats.',
  'A healthy fan curve balances noise, temps, and VRM safety margin.',
];

const generatedFacts = Array.from({ length: 80 }, (_, i) => {
  const n = i + 21;
  const facts = [
    `Fact ${n}: Block headers are 80 bytes and include version, prev hash, merkle root, time, bits, nonce.`,
    `Fact ${n}: Bech32m is used for Taproot (v1) addresses to improve error detection.`,
    `Fact ${n}: Halvings occur every 210,000 blocks, cutting subsidy and tightening issuance.`,
    `Fact ${n}: Pool variance drops as more shares are submitted toward the pool target.`,
    `Fact ${n}: Nodes relay compact blocks to cut bandwidth during block propagation.`,
  ];
  return facts[i % facts.length];
});

const factList = [...baseFacts, ...generatedFacts];

const shuffle = <T,>(arr: T[]): T[] => {
  const clone = [...arr];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [clone[i], clone[j]] = [clone[j], clone[i]];
  }
  return clone;
};

export function BitcoinLoreModal({ open, onClose, onUnlocked }: Props) {
  const { setSecretUnlocked, setTheme } = useTheme();
  const [tab, setTab] = useState<'quiz' | 'facts'>('quiz');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>(() => shuffle(questionBank).slice(0, 20));
  const [activeIndex, setActiveIndex] = useState(0);
  const [factsIndex, setFactsIndex] = useState(0);
  const [factsPaused, setFactsPaused] = useState(false);
  const [rewarded, setRewarded] = useState(false);

  if (!open) return null;

  const normalize = (s: string) => s.trim().toLowerCase();
  const fuzzyMatch = (input: string, target: string) => {
    const a = normalize(input);
    const b = normalize(target);
    if (a === b) return true;
    return b.includes(a) || a.includes(b);
  };

  const correctCount = sessionQuestions.reduce((acc, q) => {
    const val = answers[q.id] || '';
    const ok = q.answer || '';
    const isCorrect = fuzzyMatch(val, ok);
    return acc + (isCorrect ? 1 : 0);
  }, 0);

  const passed = submitted && correctCount >= 20;

  const handleSubmit = () => {
    const COIN_KEY = 'axebench_uptime_coins';
    const addCoins = (count: number) => {
      const existing = Number(localStorage.getItem(COIN_KEY) || '0');
      const next = existing + count;
      localStorage.setItem(COIN_KEY, String(next));
      toast.success(`+${count} coins earned (total ${next})`);
    };

    if (rewarded && submitted && correctCount >= 20) {
      setSubmitted(true);
      return;
    }

    setSubmitted(true);
    if (correctCount >= 20) {
      if (!rewarded) {
        addCoins(5);
        setRewarded(true);
      }
      setSecretUnlocked(true);
      setTheme('forge');
      onUnlocked();
    }
  };

  const resetQuiz = () => {
    setSessionQuestions(shuffle(questionBank).slice(0, 20));
    setActiveIndex(0);
    setAnswers({});
    setSubmitted(false);
    setRewarded(false);
  };

  useEffect(() => {
    if (!open || factsPaused) return;
    const id = setInterval(() => {
      setFactsIndex((i) => (i + 1) % factList.length);
    }, 10000);
    return () => clearInterval(id);
  }, [open, factsPaused]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 px-3">
      <div className="w-full max-w-4xl rounded-2xl border border-amber-300/30 bg-neutral-950/90 shadow-[0_0_40px_rgba(251,191,36,0.35)] p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold tracking-[0.2em] text-amber-200 uppercase">Bitcoin Lore</div>
            <div className="text-sm text-amber-100/80">
              Tap the coin 10 times to reach here. Choose facts or ace 20/20 nerd questions to unlock.
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={resetQuiz}>
              New Set
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'quiz' | 'facts')}>
          <TabsList>
            <TabsTrigger value="quiz">Quiz</TabsTrigger>
            <TabsTrigger value="facts">Facts</TabsTrigger>
          </TabsList>

          <TabsContent value="quiz" className="space-y-3 mt-3">
            <div className="flex items-center justify-between text-sm text-amber-100/80">
              <div>Score: {correctCount}/20 {submitted && !passed ? '(need 20/20)' : ''}</div>
              {passed && <div className="text-emerald-300 font-semibold">Unlocked!</div>}
            </div>

            <div className="rounded-lg border border-amber-300/20 bg-black/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-amber-100/70">
                  Question {activeIndex + 1} / {sessionQuestions.length}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                    disabled={activeIndex === 0}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveIndex((i) => Math.min(sessionQuestions.length - 1, i + 1))}
                    disabled={activeIndex === sessionQuestions.length - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>

              {sessionQuestions[activeIndex] && (
                <div className="space-y-2">
                  <div className="text-sm text-amber-50">{sessionQuestions[activeIndex].prompt}</div>
                  {sessionQuestions[activeIndex].choices ? (
                    <div className="grid grid-cols-2 gap-2">
                      {sessionQuestions[activeIndex].choices?.map((choice) => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [sessionQuestions[activeIndex].id]: choice }))}
                          className={`rounded-md border px-2 py-2 text-xs text-left transition ${
                            answers[sessionQuestions[activeIndex].id] === choice
                              ? 'border-amber-300 bg-amber-300/10 text-amber-100'
                              : 'border-amber-200/30 bg-transparent text-amber-100/80 hover:border-amber-200/60'
                          }`}
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      className="w-full rounded-md border border-amber-200/30 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300"
                      placeholder="Answer"
                      value={answers[sessionQuestions[activeIndex].id] || ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [sessionQuestions[activeIndex].id]: e.target.value }))
                      }
                    />
                  )}
                  {submitted && (
                    <div className="text-xs text-amber-100/70">
                      Correct: <span className="font-mono text-emerald-300">{sessionQuestions[activeIndex].answer}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-amber-100/70">Answer all 20 correctly to unlock.</div>
              <Button onClick={handleSubmit} variant="accent" className="uppercase tracking-wide">
                Submit
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="facts" className="mt-3">
            <div className="rounded-lg border border-amber-300/20 bg-black/50 p-4 space-y-3">
              <div className="flex items-center justify-between text-sm text-amber-100/80">
                <div>Fact {factsIndex + 1} / {factList.length}</div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setFactsIndex((i) => (i - 1 + factList.length) % factList.length)}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setFactsIndex((i) => (i + 1) % factList.length)}
                  >
                    Next
                  </Button>
                  <Button
                    size="sm"
                    variant={factsPaused ? 'secondary' : 'ghost'}
                    onClick={() => setFactsPaused((p) => !p)}
                  >
                    {factsPaused ? 'Resume' : 'Pause'}
                  </Button>
                </div>
              </div>
              <div className="rounded-md border border-amber-300/20 bg-black/60 px-3 py-3 text-sm text-amber-50 min-h-[80px] flex items-center">
                {factList[factsIndex]}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default BitcoinLoreModal;
