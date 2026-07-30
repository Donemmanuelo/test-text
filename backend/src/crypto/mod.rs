//! Cryptographic helpers for end-to-end encryption (ChaCha20-Poly1305 + X25519).
//!
//! Architecture:
//! - Each user generates an X25519 key pair on their device.
//! - The public key is stored server-side (could be in users table, omitted from DB schema for MVP).
//! - When A sends a message to B, A performs X25519 DH with B's public key to derive a shared secret,
//!   then encrypts with ChaCha20-Poly1305.
//! - The nonce is prepended to the ciphertext before storage/transmission.
//!
//! NOTE: For a full Signal Protocol implementation, use the `libsignal-protocol` crate.
//! This is a simplified MVP version.

use anyhow::{anyhow, Result};
use chacha20poly1305::{
    aead::{Aead, KeyInit, OsRng},
    ChaCha20Poly1305, Key, Nonce,
};
use x25519_dalek::{EphemeralSecret, PublicKey, SharedSecret, StaticSecret};

pub const NONCE_SIZE: usize = 12;

/// Generate a new X25519 static key pair.
pub fn generate_keypair() -> (StaticSecret, PublicKey) {
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);
    (secret, public)
}

/// Derive a ChaCha20-Poly1305 key from an X25519 shared secret using SHA-256.
pub fn derive_symmetric_key(shared_secret: &SharedSecret) -> Key {
    use sha2::{Digest, Sha256};
    let hash = Sha256::digest(shared_secret.as_bytes());
    *Key::from_slice(&hash)
}

/// Encrypt plaintext with ChaCha20-Poly1305.
/// Returns `nonce || ciphertext` as a single Vec<u8>.
pub fn encrypt(key: &Key, plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = ChaCha20Poly1305::new(key);
    let nonce_bytes: [u8; NONCE_SIZE] = rand::random();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| anyhow!("Encryption failed: {e}"))?;
    let mut output = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

/// Decrypt `nonce || ciphertext` with ChaCha20-Poly1305.
pub fn decrypt(key: &Key, nonce_and_ciphertext: &[u8]) -> Result<Vec<u8>> {
    if nonce_and_ciphertext.len() < NONCE_SIZE {
        return Err(anyhow!("Ciphertext too short"));
    }
    let (nonce_bytes, ciphertext) = nonce_and_ciphertext.split_at(NONCE_SIZE);
    let cipher = ChaCha20Poly1305::new(key);
    let nonce = Nonce::from_slice(nonce_bytes);
    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow!("Decryption failed: {e}"))
}

/// Perform X25519 Diffie-Hellman key exchange using an ephemeral secret.
pub fn ecdh_exchange(our_secret: EphemeralSecret, their_public: &PublicKey) -> SharedSecret {
    our_secret.diffie_hellman(their_public)
}
