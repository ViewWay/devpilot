//! AES-256-GCM encryption for sensitive data (API keys).
//!
//! Uses a machine-specific key derived from the app's data directory path.
//! This is NOT as secure as using the OS keychain, but provides at-rest
//! encryption so API keys aren't stored in plaintext in SQLite.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{AeadCore, Aes256Gcm, Nonce};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use sha2::{Digest, Sha256};

/// Label used for key derivation — ensures the key is app-specific.
const KEY_LABEL: &[u8] = b"devpilot-api-key-encryption-v1";

/// Encrypt a plaintext string and return a base64-encoded ciphertext.
///
/// The encryption key is derived from the machine's data directory path,
/// so the ciphertext is only decryptable on the same machine.
pub fn encrypt(plaintext: &str) -> anyhow::Result<String> {
    let key = derive_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key)?;
    let nonce = Aes256Gcm::generate_nonce(&mut aes_gcm::aead::OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;
    // Prepend nonce (12 bytes) to ciphertext and base64-encode
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}

/// Decrypt a base64-encoded ciphertext back to plaintext.
pub fn decrypt(ciphertext_b64: &str) -> anyhow::Result<String> {
    let key = derive_key()?;
    let cipher = Aes256Gcm::new_from_slice(&key)?;
    let combined = BASE64
        .decode(ciphertext_b64)
        .map_err(|e| anyhow::anyhow!("Base64 decode failed: {}", e))?;
    if combined.len() < 12 {
        return Err(anyhow::anyhow!("Ciphertext too short"));
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;
    String::from_utf8(plaintext).map_err(|e| anyhow::anyhow!("Invalid UTF-8: {}", e))
}

/// Derive a 256-bit encryption key from the machine's data directory.
///
/// This uses SHA-256(machine_data_dir + label) to produce a deterministic
/// but machine-specific key. The key is stable across app restarts.
fn derive_key() -> anyhow::Result<[u8; 32]> {
    let data_dir = dirs::data_dir().ok_or_else(|| anyhow::anyhow!("Cannot determine data dir"))?;
    let mut hasher = Sha256::new();
    hasher.update(data_dir.to_string_lossy().as_bytes());
    hasher.update(KEY_LABEL);
    Ok(hasher.finalize().into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let original = "sk-1234567890abcdef1234567890abcdef";
        let encrypted = encrypt(original).unwrap();
        assert_ne!(encrypted, original);
        assert!(encrypted.len() > original.len());
        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_encrypt_produces_different_ciphertexts() {
        let plaintext = "same-key";
        let c1 = encrypt(plaintext).unwrap();
        let c2 = encrypt(plaintext).unwrap();
        // Different nonces should produce different ciphertexts
        assert_ne!(c1, c2);
    }

    #[test]
    fn test_decrypt_invalid_base64() {
        assert!(decrypt("not-valid-base64!!!").is_err());
    }

    #[test]
    fn test_decrypt_too_short() {
        // Base64 of 5 bytes — shorter than 12-byte nonce
        assert!(decrypt("SGVsbG8=").is_err());
    }
}
