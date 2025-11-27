import { Low } from 'lowdb';
import { JSONFileSync } from 'lowdb/node';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbDir = process.env.DB_PATH ? dirname(process.env.DB_PATH) : join(__dirname, '../data');
const dbPath = process.env.DB_PATH?.replace(/\.db$/, '.json') || join(__dirname, '../data/functiomed.json');

// Ensure data directory exists
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

// Initialize with default data structure
const defaultData = {
  appointment_slots: [],
  reservations: [],
  parking_slots: [],
  parking_reservations: [],
  transcripts: [],
  knowledge_chunks: [],
  audit_logs: [],
  chat_sessions: [],
  doctors: [],
  services: []
};

// Create database file if it doesn't exist
if (!existsSync(dbPath)) {
  writeFileSync(dbPath, JSON.stringify(defaultData, null, 2));
}

const adapter = new JSONFileSync(dbPath);
const lowDb = new Low(adapter, defaultData);

// Initialize database
lowDb.read();

// Adapter class to mimic better-sqlite3 API
class DatabaseAdapter {
  constructor(lowDb) {
    this.lowDb = lowDb;
  }

  prepare(query) {
    return new Statement(this.lowDb, query);
  }

  exec(query) {
    // For schema initialization, just return
    return this;
  }

  pragma(setting) {
    // No-op for pragmas
    return this;
  }

  close() {
    // No-op
    return this;
  }
}

// Statement class to mimic better-sqlite3 prepare().run()/.get()/.all() API
class Statement {
  constructor(lowDb, query) {
    this.lowDb = lowDb;
    this.query = query;
    this.params = [];
  }

  run(...params) {
    this.params = params;
    lowDb.read();
    
    // Parse the query to determine operation
    const q = this.query.trim().toUpperCase();
    
    if (q.startsWith('INSERT INTO')) {
      return this._handleInsert();
    } else if (q.startsWith('UPDATE')) {
      return this._handleUpdate();
    } else if (q.startsWith('DELETE')) {
      return this._handleDelete();
    } else if (q.startsWith('SELECT')) {
      // For SELECT, return an object with changes property
      return { changes: 0 };
    }
    return { changes: 0 };
  }

  get(...params) {
    this.params = params;
    lowDb.read();
    
    const q = this.query.trim().toUpperCase();
    if (q.startsWith('SELECT')) {
      return this._handleSelectOne();
    }
    return undefined;
  }

  all(...params) {
    this.params = params;
    lowDb.read();
    
    const q = this.query.trim().toUpperCase();
    if (q.startsWith('SELECT')) {
      return this._handleSelectAll();
    }
    return [];
  }

  _handleInsert() {
    // Remove ON CONFLICT clauses
    let query = this.query.replace(/\s+ON CONFLICT[^)]+\)/gi, '');
    const match = query.match(/INSERT INTO\s+(\w+)/i);
    if (!match) return { changes: 0 };
    
    const table = match[1];
    const columns = this._extractColumns(query);
    const data = {};
    
    // Parse VALUES
    const valuesMatch = query.match(/VALUES\s*\(([^)]+)\)/i);
    if (valuesMatch) {
      // Better parsing of VALUES clause
      const valuesStr = valuesMatch[1];
      // Split by comma but respect quotes
      const placeholders = this._parseValues(valuesStr);
      
      placeholders.forEach((ph, idx) => {
        if (ph === '?') {
          const colName = columns[idx] || `col${idx}`;
          data[colName] = this.params[idx];
        } else if (ph.includes('datetime')) {
          const colName = columns[idx] || `col${idx}`;
          data[colName] = new Date().toISOString();
        } else {
          const colName = columns[idx] || `col${idx}`;
          // Remove quotes
          const value = ph.replace(/^['"]|['"]$/g, '');
          if (value !== 'NULL') {
            data[colName] = value;
          }
        }
      });
    }
    
    // Add timestamps if needed
    if (!data.created_at && columns.includes('created_at')) {
      data.created_at = new Date().toISOString();
    }
    if (!data.updated_at && columns.includes('updated_at')) {
      data.updated_at = new Date().toISOString();
    }
    
    if (!this.lowDb.data[table]) {
      this.lowDb.data[table] = [];
    }
    
    // Check for duplicates if ID is provided
    if (data.id && this.lowDb.data[table].find(item => item.id === data.id)) {
      return { changes: 0 };
    }
    
    this.lowDb.data[table].push(data);
    this.lowDb.write();
    return { changes: 1, lastInsertRowid: this.lowDb.data[table].length - 1 };
  }

  _parseValues(valuesStr) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;
    
    for (let i = 0; i < valuesStr.length; i++) {
      const char = valuesStr[i];
      
      if ((char === '"' || char === "'") && (i === 0 || valuesStr[i-1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
          quoteChar = null;
        }
        current += char;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      result.push(current.trim());
    }
    
    return result;
  }

  _handleUpdate() {
    const match = this.query.match(/UPDATE\s+(\w+)/i);
    if (!match) return { changes: 0 };
    
    const table = match[1];
    if (!this.lowDb.data[table]) return { changes: 0 };
    
    // Parse SET clause first
    const setMatch = this.query.match(/SET\s+(.+?)(?:\s+WHERE|$)/is);
    if (!setMatch) return { changes: 0 };
    
    const setClause = setMatch[1];
    // Split by comma, but be careful with quoted values
    const setParts = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = null;
    
    for (let i = 0; i < setClause.length; i++) {
      const char = setClause[i];
      if ((char === '"' || char === "'") && (i === 0 || setClause[i-1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
          quoteChar = null;
        }
        current += char;
      } else if (char === ',' && !inQuotes) {
        setParts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      setParts.push(current.trim());
    }
    
    const updates = {};
    let paramIdx = 0;
    
    setParts.forEach(part => {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) return;
      
      const col = part.substring(0, eqIndex).trim();
      let val = part.substring(eqIndex + 1).trim();
      
      if (val === '?') {
        updates[col] = this.params[paramIdx++];
      } else if (val.includes('datetime')) {
        updates[col] = new Date().toISOString();
      } else if (val === 'NULL') {
        updates[col] = null;
      } else {
        // Remove quotes if present
        const cleanVal = val.replace(/^['"]|['"]$/g, '');
        if (cleanVal !== 'NULL') {
          updates[col] = cleanVal;
        }
      }
    });
    
    // Parse WHERE clause - find all WHERE conditions
    const whereMatch = this.query.match(/WHERE\s+(.+?)(?:\s+ORDER BY|\s+LIMIT|$)/i);
    let filteredItems = [...(this.lowDb.data[table] || [])];
    
    if (whereMatch) {
      const whereClause = whereMatch[1];
      // Simple WHERE id = ? parsing
      const idMatch = whereClause.match(/(\w+)\s*=\s*\?/i);
      if (idMatch) {
        const whereCol = idMatch[1];
        const whereValue = this.params[paramIdx];
        filteredItems = filteredItems.filter(item => {
          return item[whereCol] === whereValue || item[whereCol] == whereValue || String(item[whereCol]) === String(whereValue);
        });
      }
    }
    
    let changes = 0;
    filteredItems.forEach(item => {
      Object.assign(item, updates);
      if (!item.updated_at) {
        item.updated_at = new Date().toISOString();
      } else {
        item.updated_at = new Date().toISOString();
      }
      changes++;
    });
    
    console.log('UPDATE operation:', {
      table,
      updates,
      filteredCount: filteredItems.length,
      changes
    });
    
    if (changes > 0) {
      this.lowDb.write();
    }
    return { changes };
  }

  _handleDelete() {
    // Simplified - not used in current code
    return { changes: 0 };
  }

  _handleSelectOne() {
    const results = this._handleSelectAll();
    return results[0];
  }

  _handleSelectAll() {
    const match = this.query.match(/FROM\s+(\w+)/i);
    if (!match) return [];
    
    const table = match[1];
    if (!this.lowDb.data[table]) {
      // Table doesn't exist yet, return empty array
      return [];
    }
    
    let results = [...this.lowDb.data[table]];
    
    // Extract WHERE clause
    const whereMatch = this.query.match(/WHERE\s+(.+?)(?:\s+ORDER BY|\s+LIMIT|$)/i);
    if (!whereMatch) {
      // No WHERE clause - return all results, but handle ORDER BY and LIMIT
      return this._applyOrderByAndLimit(results);
    }
    
    let whereClause = whereMatch[1];
    let paramIndex = 0;
    
    // Handle complex WHERE clauses with AND/OR
    // Split by AND first (simple approach)
    const andConditions = whereClause.split(/\s+AND\s+/i);
    
    for (const condition of andConditions) {
      const trimmed = condition.trim();
      
      // Handle OR conditions (simplified - just check if any condition matches)
      if (trimmed.includes('OR')) {
        const orParts = trimmed.split(/\s+OR\s+/i);
        const orMatch = orParts.some(orPart => {
          return this._evaluateCondition(orPart.trim(), results, paramIndex);
        });
        if (!orMatch) {
          results = [];
          break;
        }
        continue;
      }
      
      // Handle IS NULL / IS NOT NULL
      const isNullMatch = trimmed.match(/(\w+)\s+IS\s+(NOT\s+)?NULL/i);
      if (isNullMatch) {
        const col = isNullMatch[1];
        const isNot = isNullMatch[2];
        if (isNot) {
          results = results.filter(item => item[col] != null && item[col] !== '');
        } else {
          results = results.filter(item => item[col] == null || item[col] === '');
        }
        continue;
      }
      
      // Handle parenthesized conditions like (hold_expiry IS NULL OR hold_expiry < ?)
      const parenMatch = trimmed.match(/\((.+)\)/);
      if (parenMatch) {
        const inner = parenMatch[1];
        const orParts = inner.split(/\s+OR\s+/i);
        
        // Filter results where at least one OR condition matches
        const filtered = results.filter(item => {
          return orParts.some(part => {
            const partTrimmed = part.trim();
            
            // Check IS NULL
            const isNullMatch = partTrimmed.match(/(\w+)\s+IS\s+(NOT\s+)?NULL/i);
            if (isNullMatch) {
              const col = isNullMatch[1];
              const isNot = isNullMatch[2];
              if (isNot) {
                return item[col] != null && item[col] !== '';
              } else {
                return item[col] == null || item[col] === '';
              }
            }
            
            // Check comparison
            const compMatch = partTrimmed.match(/(\w+)\s*(=|>|<|>=|<=|!=)\s*\?/i);
            if (compMatch) {
              const col = compMatch[1];
              const op = compMatch[2].trim();
              const value = this.params[paramIndex];
              
              if (op === '=') return item[col] == value || item[col] === value;
              if (op === '>') return item[col] > value;
              if (op === '<') return item[col] < value;
              if (op === '>=') return item[col] >= value;
              if (op === '<=') return item[col] <= value;
            }
            
            return false;
          });
        });
        
        results = filtered;
        // Increment param index for each ? in the OR clause
        const placeholderCount = inner.match(/\?/g)?.length || 0;
        paramIndex += placeholderCount;
        continue;
      }
      
      // Handle DATE() function in WHERE clause
      const dateMatch = trimmed.match(/DATE\((\w+)\)\s*(=|>|<|>=|<=)\s*\?/i);
      if (dateMatch) {
        const col = dateMatch[1];
        const op = dateMatch[2].trim();
        const value = this.params[paramIndex];
        paramIndex++;
        
        results = results.filter(item => {
          const itemDate = item[col]?.split('T')[0] || new Date(item[col]).toISOString().split('T')[0];
          const filterDate = value.split('T')[0] || new Date(value).toISOString().split('T')[0];
          
          if (op === '=') return itemDate === filterDate;
          if (op === '>') return itemDate > filterDate;
          if (op === '<') return itemDate < filterDate;
          if (op === '>=') return itemDate >= filterDate;
          if (op === '<=') return itemDate <= filterDate;
          return false;
        });
        continue;
      }
      
      // Regular condition
      const newResults = this._evaluateWhereCondition(trimmed, results, paramIndex);
      // Increment param index for placeholders in this condition
      const placeholderCount = (trimmed.match(/\?/g) || []).length;
      paramIndex += placeholderCount;
      results = newResults;
      if (results.length === 0) break;
    }
    
    // Parse ORDER BY
    const orderMatch = this.query.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const orderCol = orderMatch[1];
      const direction = orderMatch[2]?.toUpperCase() === 'DESC' ? -1 : 1;
      results.sort((a, b) => {
        if (a[orderCol] < b[orderCol]) return -1 * direction;
        if (a[orderCol] > b[orderCol]) return 1 * direction;
        return 0;
      });
    }
    
    // Parse LIMIT
    const limitMatch = this.query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]));
    }
    
    return results;
  }
  
  _applyOrderByAndLimit(results) {
    // Parse ORDER BY
    const orderMatch = this.query.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const orderCol = orderMatch[1];
      const direction = orderMatch[2]?.toUpperCase() === 'DESC' ? -1 : 1;
      results.sort((a, b) => {
        if (a[orderCol] < b[orderCol]) return -1 * direction;
        if (a[orderCol] > b[orderCol]) return 1 * direction;
        return 0;
      });
    }
    
    // Parse LIMIT
    const limitMatch = this.query.match(/LIMIT\s+(\d+)/i);
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]));
    }
    
    return results;
  }

  _evaluateWhereCondition(condition, results, paramIndex) {
    // Handle IS NULL first
    const isNullMatch = condition.match(/(\w+)\s+IS\s+(NOT\s+)?NULL/i);
    if (isNullMatch) {
      const col = isNullMatch[1];
      const isNot = isNullMatch[2];
      if (isNot) {
        return results.filter(item => item[col] != null && item[col] !== '');
      } else {
        return results.filter(item => item[col] == null || item[col] === '');
      }
    }
    
    // Match column operator value
    const match = condition.match(/(\w+)\s*(=|>|<|>=|<=|!=)\s*(?:\?|'([^']+)'|"([^"]+)")/i);
    if (!match) return results;
    
    const col = match[1];
    const op = match[2].trim();
    let value = match[3] || match[4];
    
    // Get value from params if it's a placeholder
    if (condition.includes('?')) {
      value = this.params[paramIndex];
      // Note: paramIndex is passed by value, caller needs to increment
    }
    
    return results.filter(item => {
      const itemVal = item[col];
      if (op === '=') {
        return itemVal == value || itemVal === value;
      } else if (op === '>') {
        return itemVal > value;
      } else if (op === '<') {
        return itemVal < value;
      } else if (op === '>=') {
        return itemVal >= value;
      } else if (op === '<=') {
        return itemVal <= value;
      } else if (op === '!=') {
        return itemVal != value && itemVal !== value;
      }
      return true;
    });
  }

  _evaluateCondition(condition, results, paramIndex) {
    // Simplified condition evaluator for OR clauses
    const isNullMatch = condition.match(/(\w+)\s+IS\s+(NOT\s+)?NULL/i);
    if (isNullMatch) {
      const col = isNullMatch[1];
      const isNot = isNullMatch[2];
      return results.some(item => {
        if (isNot) {
          return item[col] != null && item[col] !== '';
        } else {
          return item[col] == null || item[col] === '';
        }
      });
    }
    
    const match = condition.match(/(\w+)\s*(=|>|<|>=|<=|!=)\s*(?:\?|'([^']+)'|"([^"]+)")/i);
    if (!match) return false;
    
    const col = match[1];
    const op = match[2].trim();
    let value = match[3] || match[4];
    
    if (condition.includes('?')) {
      value = this.params[paramIndex];
      paramIndex++;
    }
    
    return results.some(item => {
      const itemVal = item[col];
      if (op === '=') return itemVal == value || itemVal === value;
      if (op === '>') return itemVal > value;
      if (op === '<') return itemVal < value;
      if (op === '>=') return itemVal >= value;
      if (op === '<=') return itemVal <= value;
      return false;
    });
  }

  _extractColumns(query) {
    const match = query.match(/INSERT INTO\s+\w+\s*\(([^)]+)\)/i);
    if (!match) return [];
    return match[1].split(',').map(c => c.trim());
  }
}

// Initialize database
export async function initDb() {
  lowDb.read();
  if (!lowDb.data || Object.keys(lowDb.data).length === 0) {
    lowDb.data = defaultData;
    lowDb.write();
  }
  return lowDb;
}

// Create adapter instance
export const db = new DatabaseAdapter(lowDb);
export { lowDb };

// Wrapper for transactions (sync wrapper)
export const withTransaction = (callback) => {
  return callback();
};

export default db;
