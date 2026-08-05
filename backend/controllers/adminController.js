const pool = require('../db/pool');

// Middleware for authentication (separate file in middleware folder)
const getTables = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('users', 'user_sessions')
    `);
    
    // Get table info
    const tables = [];
    for (const row of result.rows) {
      const count = await pool.query(
        `SELECT COUNT(*) FROM ${row.table_name}`
      );
      tables.push({
        name: row.table_name,
        rowCount: parseInt(count.rows[0].count)
      });
    }
    
    res.json(tables);
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ error: 'Failed to get tables' });
  }
};

const createTable = async (req, res) => {
  try {
    const { tableName, columns } = req.body;
    
    if (!tableName || !columns || !Array.isArray(columns)) {
      return res.status(400).json({ error: 'Table name and columns required' });
    }
    
    // Build CREATE TABLE query
    let query = `CREATE TABLE ${tableName} (id SERIAL PRIMARY KEY`;
    columns.forEach(col => {
      let colDef = `, ${col.name} ${col.type}`;
      if (col.notNull) colDef += ' NOT NULL';
      if (col.default) colDef += ` DEFAULT ${col.default}`;
      query += colDef;
    });
    query += ')';
    
    await pool.query(query);
    res.status(201).json({ message: `Table ${tableName} created successfully` });
  } catch (error) {
    console.error('Create table error:', error);
    res.status(500).json({ error: 'Failed to create table: ' + error.message });
  }
};

const dropTable = async (req, res) => {
  try {
    const { tableName } = req.params;
    await pool.query(`DROP TABLE IF EXISTS ${tableName} CASCADE`);
    res.json({ message: `Table ${tableName} dropped successfully` });
  } catch (error) {
    console.error('Drop table error:', error);
    res.status(500).json({ error: 'Failed to drop table' });
  }
};

const getTableData = async (req, res) => {
  try {
    const { tableName } = req.params;
    const { limit = 100, offset = 0 } = req.query;
    
    const data = await pool.query(
      `SELECT * FROM ${tableName} LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    const count = await pool.query(`SELECT COUNT(*) FROM ${tableName}`);
    
    res.json({
      data: data.rows,
      total: parseInt(count.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Get table data error:', error);
    res.status(500).json({ error: 'Failed to get table data' });
  }
};

const insertData = async (req, res) => {
  try {
    const { tableName } = req.params;
    const data = req.body;
    
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Insert data error:', error);
    res.status(500).json({ error: 'Failed to insert data' });
  }
};

const updateData = async (req, res) => {
  try {
    const { tableName, id } = req.params;
    const data = req.body;
    
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
    
    const query = `
      UPDATE ${tableName}
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [id, ...values]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update data error:', error);
    res.status(500).json({ error: 'Failed to update data' });
  }
};

const deleteData = async (req, res) => {
  try {
    const { tableName, id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM ${tableName} WHERE id = $1 RETURNING *`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    res.json({ message: 'Record deleted successfully' });
  } catch (error) {
    console.error('Delete data error:', error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
};

module.exports = {
  getTables,
  createTable,
  dropTable,
  getTableData,
  insertData,
  updateData,
  deleteData
};
