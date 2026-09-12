use crate::error::{Result, ShaheenError};

/// Manages independent outbound and inbound sequence numbers as required by
/// the MWA specification.
///
/// Rules:
/// - Outbound sequence numbers start at 1 and increment by 1 on each outbound frame.
/// - Inbound sequence numbers start expecting 1 for the first message, and each
///   subsequent message must be exactly previous + 1.
/// - Any gap, replay, or duplicate immediately triggers a SequenceMismatch error.
#[derive(Debug, Clone)]
pub struct SequenceTracker {
    send_seq: u32,
    recv_seq: Option<u32>,
}

impl SequenceTracker {
    pub fn new() -> Self {
        Self {
            send_seq: 1,
            recv_seq: None,
        }
    }

    /// Returns the sequence number to use for the next outbound encrypted frame,
    /// and increments the internal counter.
    pub fn next_send_sequence(&mut self) -> u32 {
        let current = self.send_seq;
        self.send_seq = self.send_seq.checked_add(1).expect("Sequence overflow");
        current
    }

    /// Validates an incoming sequence number against protocol monotonicity rules.
    /// Returns Ok(()) if valid, or Err(ShaheenError::SequenceMismatch) if violated.
    pub fn validate_and_update_recv(&mut self, received: u32) -> Result<()> {
        match self.recv_seq {
            None => {
                if received != 1 {
                    return Err(ShaheenError::SequenceMismatch {
                        expected: 1,
                        received,
                    });
                }
                self.recv_seq = Some(1);
                Ok(())
            }
            Some(prev) => {
                let expected = prev + 1;
                if received != expected {
                    return Err(ShaheenError::SequenceMismatch { expected, received });
                }
                self.recv_seq = Some(received);
                Ok(())
            }
        }
    }

    pub fn last_recv_sequence(&self) -> Option<u32> {
        self.recv_seq
    }
}

impl Default for SequenceTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_monotonic_sequence() {
        let mut tracker = SequenceTracker::new();
        assert_eq!(tracker.next_send_sequence(), 1);
        assert_eq!(tracker.next_send_sequence(), 2);
        assert_eq!(tracker.next_send_sequence(), 3);

        assert!(tracker.validate_and_update_recv(1).is_ok());
        assert!(tracker.validate_and_update_recv(2).is_ok());
        assert!(tracker.validate_and_update_recv(3).is_ok());
        assert!(tracker.validate_and_update_recv(4).is_ok());
    }

    #[test]
    fn test_initial_non_one_rejected() {
        let mut tracker = SequenceTracker::new();
        assert!(tracker.validate_and_update_recv(2).is_err());
    }

    #[test]
    fn test_skip_sequence_rejected() {
        let mut tracker = SequenceTracker::new();
        assert!(tracker.validate_and_update_recv(1).is_ok());
        assert!(tracker.validate_and_update_recv(3).is_err());
    }

    #[test]
    fn test_replay_sequence_rejected() {
        let mut tracker = SequenceTracker::new();
        assert!(tracker.validate_and_update_recv(1).is_ok());
        assert!(tracker.validate_and_update_recv(2).is_ok());
        assert!(tracker.validate_and_update_recv(2).is_err());
    }

    #[test]
    fn test_backwards_sequence_rejected() {
        let mut tracker = SequenceTracker::new();
        assert!(tracker.validate_and_update_recv(1).is_ok());
        assert!(tracker.validate_and_update_recv(2).is_ok());
        assert!(tracker.validate_and_update_recv(1).is_err());
    }
}
