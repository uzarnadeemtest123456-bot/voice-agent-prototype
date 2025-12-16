/**
 * SSE (Server-Sent Events) parser utility
 * Parses SSE format: event: eventName\ndata: {json}\n\n
 */

export class SSEParser {
  constructor() {
    this.buffer = '';
  }

  /**
   * Parse incoming chunk and return complete events
   * @param {string} chunk - New text chunk from stream
   * @returns {Array} Array of parsed events: [{event: 'delta', data: {...}}]
   */
  parse(chunk) {
    this.buffer += chunk;
    const events = [];
    
    // Split by double newline (event separator)
    const parts = this.buffer.split('\n\n');
    
    // Keep last incomplete part in buffer
    this.buffer = parts.pop() || '';
    
    // Parse complete events
    for (const part of parts) {
      if (!part.trim()) continue;
      
      const lines = part.split('\n');
      let eventType = 'message'; // default
      let eventData = null;
      
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          const dataStr = line.substring(5).trim();
          try {
            eventData = JSON.parse(dataStr);
          } catch (e) {
            // If not JSON, use raw string
            eventData = dataStr;
          }
        }
      }
      
      if (eventData !== null) {
        events.push({ event: eventType, data: eventData });
      }
    }
    
    return events;
  }

  /**
   * Reset parser state
   */
  reset() {
    this.buffer = '';
  }
}
