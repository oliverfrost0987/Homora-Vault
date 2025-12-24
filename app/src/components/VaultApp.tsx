import { useCallback, useEffect, useMemo, useState } from 'react';
import { Contract, formatUnits, parseUnits } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';
import { Header } from './Header';
import { TOKEN_ABI, TOKEN_ADDRESS, TOKEN_DECIMALS, VAULT_ABI, VAULT_ADDRESS } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/VaultApp.css';

const ZERO_HANDLE = ('0x' + '0'.repeat(64)) as `0x${string}`;

function formatTokenAmount(value: bigint | null) {
  if (value === null) {
    return '--';
  }
  const raw = formatUnits(value, TOKEN_DECIMALS);
  const [whole, fraction = ''] = raw.split('.');
  const trimmed = fraction.slice(0, 3);
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function formatTimestamp(value: number | null) {
  if (!value) {
    return 'Not set';
  }
  return new Date(value * 1000).toLocaleString();
}

export function VaultApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [balance, setBalance] = useState<bigint | null>(null);
  const [stakeAmount, setStakeAmount] = useState<bigint | null>(null);
  const [stakeUnlockTime, setStakeUnlockTime] = useState<number | null>(null);
  const [stakeActive, setStakeActive] = useState(false);
  const [withdrawable, setWithdrawable] = useState(false);
  const [hasClaimed, setHasClaimed] = useState<boolean | null>(null);
  const [isOperator, setIsOperator] = useState<boolean | null>(null);
  const [operatorDays, setOperatorDays] = useState('365');
  const [stakeInput, setStakeInput] = useState('');
  const [lockHours, setLockHours] = useState('24');
  const [status, setStatus] = useState<string | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const canDecrypt = useMemo(() => {
    return Boolean(instance && signerPromise && address);
  }, [instance, signerPromise, address]);

  const decryptHandle = useCallback(
    async (handle: `0x${string}`, contractAddress: `0x${string}`) => {
      if (!instance || !address || !signerPromise) {
        return null;
      }
      if (handle === ZERO_HANDLE) {
        return 0n;
      }

      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        {
          handle,
          contractAddress,
        },
      ];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [contractAddress];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const signer = await signerPromise;
      if (!signer) {
        return null;
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decrypted = result[handle as string];
      if (!decrypted) {
        return null;
      }
      return BigInt(decrypted);
    },
    [address, instance, signerPromise],
  );

  const refreshState = useCallback(async () => {
    if (!publicClient || !address) {
      return;
    }

    setIsRefreshing(true);
    setStatus(null);

    try {
      const [encryptedBalance, stakeData, claimed, operator, withdrawReady] = await Promise.all([
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: 'confidentialBalanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'getStake',
          args: [address],
        }),
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: 'hasClaimed',
          args: [address],
        }),
        publicClient.readContract({
          address: TOKEN_ADDRESS,
          abi: TOKEN_ABI,
          functionName: 'isOperator',
          args: [address, VAULT_ADDRESS],
        }),
        publicClient.readContract({
          address: VAULT_ADDRESS,
          abi: VAULT_ABI,
          functionName: 'isWithdrawable',
          args: [address],
        }),
      ]);

      const stakeTuple = stakeData as readonly [`0x${string}`, bigint, boolean];
      const encryptedStake = stakeTuple[0];

      setStakeUnlockTime(Number(stakeTuple[1]));
      setStakeActive(Boolean(stakeTuple[2]));
      setHasClaimed(Boolean(claimed));
      setIsOperator(Boolean(operator));
      setWithdrawable(Boolean(withdrawReady));

      if (canDecrypt) {
        const [decryptedBalance, decryptedStake] = await Promise.all([
          decryptHandle(encryptedBalance as `0x${string}`, TOKEN_ADDRESS),
          decryptHandle(encryptedStake, VAULT_ADDRESS),
        ]);
        setBalance(decryptedBalance);
        setStakeAmount(decryptedStake);
      } else {
        setBalance(null);
        setStakeAmount(null);
      }
    } catch (error) {
      console.error('Failed to refresh vault state:', error);
      setStatus('Failed to load onchain data. Check your connection and retry.');
    } finally {
      setIsRefreshing(false);
    }
  }, [address, canDecrypt, decryptHandle, publicClient]);

  useEffect(() => {
    if (!address) {
      setBalance(null);
      setStakeAmount(null);
      setStakeUnlockTime(null);
      setStakeActive(false);
      setWithdrawable(false);
      setHasClaimed(null);
      setIsOperator(null);
      return;
    }

    refreshState();
  }, [address, refreshState]);

  const handleClaim = async () => {
    if (!signerPromise) {
      setStatus('Connect your wallet to claim tokens.');
      return;
    }

    setIsClaiming(true);
    setStatus(null);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }
      const tokenContract = new Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
      const tx = await tokenContract.claim();
      await tx.wait();
      setStatus('Tokens claimed successfully.');
      await refreshState();
    } catch (error) {
      console.error('Claim failed:', error);
      setStatus('Claim failed. Check wallet permissions and try again.');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleSetOperator = async () => {
    if (!signerPromise) {
      setStatus('Connect your wallet to authorize the vault.');
      return;
    }

    const daysValue = Number(operatorDays);
    if (!Number.isFinite(daysValue) || daysValue <= 0) {
      setStatus('Enter a valid number of days for the operator window.');
      return;
    }

    setIsApproving(true);
    setStatus(null);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }
      const tokenContract = new Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
      const until = Math.floor(Date.now() / 1000) + Math.floor(daysValue * 24 * 60 * 60);
      const tx = await tokenContract.setOperator(VAULT_ADDRESS, until);
      await tx.wait();
      setStatus('Vault authorization updated.');
      await refreshState();
    } catch (error) {
      console.error('Operator update failed:', error);
      setStatus('Failed to authorize the vault. Try again.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleStake = async () => {
    if (!instance || !signerPromise || !address) {
      setStatus('Connect your wallet and wait for encryption to initialize.');
      return;
    }

    if (!isOperator) {
      setStatus('Authorize the vault before staking.');
      return;
    }

    if (!stakeInput) {
      setStatus('Enter a stake amount.');
      return;
    }

    const hoursValue = Number(lockHours);
    if (!Number.isFinite(hoursValue) || hoursValue <= 0) {
      setStatus('Enter a valid lock duration.');
      return;
    }

    setIsStaking(true);
    setStatus(null);
    try {
      const amount = parseUnits(stakeInput, TOKEN_DECIMALS);
      if (amount <= 0n) {
        setStatus('Stake amount must be greater than zero.');
        setIsStaking(false);
        return;
      }

      const encryptedInput = await instance
        .createEncryptedInput(TOKEN_ADDRESS, address)
        .add64(amount)
        .encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }
      const vaultContract = new Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      const duration = Math.floor(hoursValue * 3600);
      const tx = await vaultContract.stake(
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        duration,
      );
      await tx.wait();
      setStatus('Stake placed. Your amount remains encrypted on-chain.');
      setStakeInput('');
      await refreshState();
    } catch (error) {
      console.error('Stake failed:', error);
      setStatus('Stake failed. Ensure you have balance and operator access.');
    } finally {
      setIsStaking(false);
    }
  };

  const handleWithdraw = async () => {
    if (!signerPromise) {
      setStatus('Connect your wallet to withdraw.');
      return;
    }

    setIsWithdrawing(true);
    setStatus(null);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }
      const vaultContract = new Contract(VAULT_ADDRESS, VAULT_ABI, signer);
      const tx = await vaultContract.withdraw();
      await tx.wait();
      setStatus('Withdrawal confirmed.');
      await refreshState();
    } catch (error) {
      console.error('Withdraw failed:', error);
      setStatus('Withdraw failed. Confirm the lock time has passed.');
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="vault-app">
      <Header />
      <main className="vault-main">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Encrypted staking vault</p>
            <h2>Stake with time locks. Keep amounts private.</h2>
            <p className="hero-description">
              Homora Vault lets you claim tokens, stake them with encrypted amounts, and withdraw only after
              the lock expires.
            </p>
            <div className="hero-actions">
              <button
                className="primary-button"
                onClick={handleClaim}
                disabled={!isConnected || isClaiming || hasClaimed === true}
              >
                {isClaiming ? 'Claiming...' : hasClaimed ? 'Claimed' : 'Claim Tokens'}
              </button>
              <button className="ghost-button" onClick={refreshState} disabled={!isConnected || isRefreshing}>
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            {zamaLoading && <p className="status-text">Initializing encryption service...</p>}
            {zamaError && <p className="status-text error-text">{zamaError}</p>}
            {status && <p className="status-text">{status}</p>}
          </div>
          <div className="hero-card">
            <div>
              <p className="card-label">Wallet balance</p>
              <p className="card-value">
                {canDecrypt ? formatTokenAmount(balance) : 'Encrypted'}
                <span className="card-unit">HVT</span>
              </p>
            </div>
            <div>
              <p className="card-label">Staked amount</p>
              <p className="card-value">
                {stakeActive && canDecrypt ? formatTokenAmount(stakeAmount) : stakeActive ? 'Encrypted' : '0'}
                <span className="card-unit">HVT</span>
              </p>
            </div>
            <div className="card-row">
              <div>
                <p className="card-label">Unlock time</p>
                <p className="card-meta">{stakeActive ? formatTimestamp(stakeUnlockTime) : 'No active stake'}</p>
              </div>
              <div className={`pill ${withdrawable ? 'pill-ready' : 'pill-locked'}`}>
                {withdrawable ? 'Withdrawable' : 'Locked'}
              </div>
            </div>
          </div>
        </section>

        <section className="panel-grid">
          <div className="panel">
            <h3>Authorize Vault</h3>
            <p>
              The vault needs operator access to move encrypted tokens on your behalf. Set an expiry window
              to keep control.
            </p>
            <label className="input-label" htmlFor="operatorDays">Operator window (days)</label>
            <input
              id="operatorDays"
              className="text-input"
              type="number"
              min="1"
              value={operatorDays}
              onChange={(event) => setOperatorDays(event.target.value)}
              placeholder="365"
            />
            <button
              className="primary-button full-width"
              onClick={handleSetOperator}
              disabled={!isConnected || isApproving}
            >
              {isApproving ? 'Authorizing...' : isOperator ? 'Update Authorization' : 'Authorize Vault'}
            </button>
          </div>

          <div className="panel">
            <h3>Stake Tokens</h3>
            <p>
              Choose how much to stake and how long to lock. Your stake amount is encrypted using Zama FHE.
            </p>
            <label className="input-label" htmlFor="stakeAmount">Stake amount (HVT)</label>
            <input
              id="stakeAmount"
              className="text-input"
              type="text"
              inputMode="decimal"
              value={stakeInput}
              onChange={(event) => setStakeInput(event.target.value)}
              placeholder="250.0"
            />
            <label className="input-label" htmlFor="lockHours">Lock duration (hours)</label>
            <input
              id="lockHours"
              className="text-input"
              type="number"
              min="1"
              value={lockHours}
              onChange={(event) => setLockHours(event.target.value)}
              placeholder="24"
            />
            <button
              className="primary-button full-width"
              onClick={handleStake}
              disabled={!isConnected || isStaking || stakeActive}
            >
              {isStaking ? 'Staking...' : stakeActive ? 'Stake Active' : 'Stake Now'}
            </button>
          </div>

          <div className="panel">
            <h3>Withdraw Stake</h3>
            <p>
              Once the lock expires, you can withdraw your encrypted stake back to your wallet.
            </p>
            <div className="panel-meta">
              <span className="meta-label">Current status</span>
              <span className="meta-value">{stakeActive ? (withdrawable ? 'Ready' : 'Locked') : 'Idle'}</span>
            </div>
            <div className="panel-meta">
              <span className="meta-label">Unlock</span>
              <span className="meta-value">{stakeActive ? formatTimestamp(stakeUnlockTime) : 'No lock set'}</span>
            </div>
            <button
              className="primary-button full-width"
              onClick={handleWithdraw}
              disabled={!isConnected || isWithdrawing || !withdrawable}
            >
              {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
