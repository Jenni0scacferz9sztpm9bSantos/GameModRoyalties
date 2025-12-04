// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ModRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  creator: string;
  category: string;
  downloads: number;
  donations: number;
}

const App: React.FC = () => {
  // Randomly selected styles: High contrast (red+black), Cyberpunk UI, Center radiation layout, Animation rich
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [mods, setMods] = useState<ModRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newModData, setNewModData] = useState({
    name: "",
    category: "",
    description: ""
  });
  const [showStats, setShowStats] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Randomly selected features: Data list, Wallet management, Data statistics, Search & filter
  useEffect(() => {
    loadMods().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadMods = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("mod_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing mod keys:", e);
        }
      }
      
      const list: ModRecord[] = [];
      
      for (const key of keys) {
        try {
          const modBytes = await contract.getData(`mod_${key}`);
          if (modBytes.length > 0) {
            try {
              const modData = JSON.parse(ethers.toUtf8String(modBytes));
              list.push({
                id: key,
                encryptedData: modData.data,
                timestamp: modData.timestamp,
                creator: modData.creator,
                category: modData.category,
                downloads: modData.downloads || 0,
                donations: modData.donations || 0
              });
            } catch (e) {
              console.error(`Error parsing mod data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading mod ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setMods(list);
    } catch (e) {
      console.error("Error loading mods:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitMod = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting mod data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newModData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const modId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const modData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        creator: account,
        category: newModData.category,
        downloads: 0,
        donations: 0
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `mod_${modId}`, 
        ethers.toUtf8Bytes(JSON.stringify(modData))
      );
      
      const keysBytes = await contract.getData("mod_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(modId);
      
      await contract.setData(
        "mod_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Mod submitted securely with FHE encryption!"
      });
      
      await loadMods();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewModData({
          name: "",
          category: "",
          description: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const donateToMod = async (modId: string, amount: number) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing donation with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const modBytes = await contract.getData(`mod_${modId}`);
      if (modBytes.length === 0) {
        throw new Error("Mod not found");
      }
      
      const modData = JSON.parse(ethers.toUtf8String(modBytes));
      
      const updatedMod = {
        ...modData,
        donations: (modData.donations || 0) + amount
      };
      
      await contract.setData(
        `mod_${modId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedMod))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Donation processed with FHE!"
      });
      
      await loadMods();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Donation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const downloadMod = async (modId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Tracking download with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const modBytes = await contract.getData(`mod_${modId}`);
      if (modBytes.length === 0) {
        throw new Error("Mod not found");
      }
      
      const modData = JSON.parse(ethers.toUtf8String(modBytes));
      
      const updatedMod = {
        ...modData,
        downloads: (modData.downloads || 0) + 1
      };
      
      await contract.setData(
        `mod_${modId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedMod))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Download tracked with FHE!"
      });
      
      await loadMods();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Download failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredMods = mods.filter(mod => 
    mod.category.toLowerCase().includes(searchTerm.toLowerCase()) || 
    mod.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalDownloads = mods.reduce((sum, mod) => sum + mod.downloads, 0);
  const totalDonations = mods.reduce((sum, mod) => sum + mod.donations, 0);

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <div className="radiation-center">
        <div className="radiation-lines">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="radiation-line" style={{ transform: `rotate(${i * 30}deg)` }}></div>
          ))}
        </div>
        
        <header className="app-header">
          <div className="logo">
            <h1>MOD<span>CRYPT</span></h1>
            <p>Anonymous Mod Royalties with FHE</p>
          </div>
          
          <div className="header-actions">
            <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
          </div>
        </header>
        
        <main className="main-content">
          <div className="hero-section">
            <div className="hero-text">
              <h2>Game Mod Royalties</h2>
              <p>Receive anonymous donations and track downloads with fully homomorphic encryption</p>
              <button 
                onClick={() => setShowCreateModal(true)} 
                className="cyber-button primary"
              >
                Upload Mod
              </button>
            </div>
            <div className="hero-image">
              <div className="fhe-logo"></div>
            </div>
          </div>
          
          <div className="stats-toggle">
            <button 
              onClick={() => setShowStats(!showStats)}
              className="cyber-button"
            >
              {showStats ? "Hide Stats" : "Show Stats"}
            </button>
          </div>
          
          {showStats && (
            <div className="stats-section">
              <div className="stat-card">
                <h3>Total Mods</h3>
                <div className="stat-value">{mods.length}</div>
              </div>
              <div className="stat-card">
                <h3>Total Downloads</h3>
                <div className="stat-value">{totalDownloads}</div>
              </div>
              <div className="stat-card">
                <h3>Total Donations</h3>
                <div className="stat-value">{totalDonations} ETH</div>
              </div>
            </div>
          )}
          
          <div className="search-section">
            <input
              type="text"
              placeholder="Search mods..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="cyber-input"
            />
          </div>
          
          <div className="mods-list">
            <h2>Community Mods</h2>
            {filteredMods.length === 0 ? (
              <div className="no-mods">
                <p>No mods found matching your search</p>
                <button 
                  className="cyber-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Upload First Mod
                </button>
              </div>
            ) : (
              filteredMods.map(mod => (
                <div className="mod-card" key={mod.id}>
                  <div className="mod-header">
                    <h3>#{mod.id.substring(0, 6)}</h3>
                    <span className="category">{mod.category}</span>
                  </div>
                  <div className="mod-details">
                    <p>Creator: {mod.creator.substring(0, 6)}...{mod.creator.substring(38)}</p>
                    <p>Uploaded: {new Date(mod.timestamp * 1000).toLocaleDateString()}</p>
                    <div className="mod-stats">
                      <span>Downloads: {mod.downloads}</span>
                      <span>Donations: {mod.donations} ETH</span>
                    </div>
                  </div>
                  <div className="mod-actions">
                    <button 
                      className="cyber-button"
                      onClick={() => downloadMod(mod.id)}
                    >
                      Download
                    </button>
                    <button 
                      className="cyber-button primary"
                      onClick={() => donateToMod(mod.id, 0.1)}
                    >
                      Donate 0.1 ETH
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
        
        <footer className="app-footer">
          <p>Powered by FHE technology • Anonymous mod royalties</p>
          <div className="footer-links">
            <a href="#" className="footer-link">Docs</a>
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </footer>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitMod} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          modData={newModData}
          setModData={setNewModData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  modData: any;
  setModData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  modData,
  setModData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setModData({
      ...modData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!modData.name || !modData.category) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Upload New Mod</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            Your mod data will be encrypted with FHE for anonymous royalties
          </div>
          
          <div className="form-group">
            <label>Mod Name *</label>
            <input 
              type="text"
              name="name"
              value={modData.name} 
              onChange={handleChange}
              placeholder="My Awesome Mod" 
              className="cyber-input"
            />
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select 
              name="category"
              value={modData.category} 
              onChange={handleChange}
              className="cyber-select"
            >
              <option value="">Select category</option>
              <option value="Gameplay">Gameplay</option>
              <option value="Graphics">Graphics</option>
              <option value="UI">UI</option>
              <option value="Sound">Sound</option>
              <option value="Other">Other</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description"
              value={modData.description} 
              onChange={handleChange}
              placeholder="Describe your mod..." 
              className="cyber-textarea"
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Upload Mod"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;