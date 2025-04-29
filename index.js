const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'Tm8eRQiGyHhmMk4DRYwyi7/AOw1Lpqgyv1CCmywNRME=';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'mysql-mysqlaccess.alwaysdata.net',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || '411189_root',
  password: process.env.DB_PASSWORD || '7mYY8XeVN8rwTN_',
  database: process.env.DB_NAME || 'mysqlaccess_ecommerce',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});




// Initialize database
const initializeDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    
    // Create products table if it doesn't exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        category VARCHAR(100) NOT NULL,
        quantity INT DEFAULT 0,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create users table if it doesn't exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        isAdmin BOOLEAN DEFAULT false,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create orders table if it doesn't exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        totalAmount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )
    `);
    
    // Create order_items table for order details
    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        orderId INT NOT NULL,
        productId INT NOT NULL,
        quantity INT NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (orderId) REFERENCES orders(id),
        FOREIGN KEY (productId) REFERENCES products(id)
      )
    `);
    
    // Check if products table is empty
    const [productRows] = await connection.query('SELECT COUNT(*) as count FROM products');
    
    // Insert sample data if table is empty
    if (productRows[0].count === 0) {
      await connection.query(`
        INSERT INTO products (name, description, price, category, quantity) VALUES
        ('iPhone 13', 'Latest iPhone with A15 Bionic chip', 999.99, 'Electronics',  50),
        ('Samsung Galaxy S21', 'Flagship Android smartphone with 120Hz display', 799.99, 'Electronics', 35),
        ('Nike Air Max', 'Comfortable running shoes with air cushioning', 129.99, 'Footwear', 100),
        ('Levi\\'s 501 Jeans', 'Classic straight fit denim jeans', 59.99, 'Clothing', 200),
        ('Sony WH-1000XM4', 'Wireless noise-cancelling headphones', 349.99, 'Electronics', 25)
      `);
      console.log('Sample products added to database');
    }
    
    // Check if users table is empty
    const [userRows] = await connection.query('SELECT COUNT(*) as count FROM users');
    
    // Insert sample users if table is empty
    if (userRows[0].count === 0) {
      const adminPassword = await bcrypt.hash('admin123', 10);
      const userPassword = await bcrypt.hash('user123', 10);
      
      await connection.query(`
        INSERT INTO users (name, email, password, isAdmin) VALUES
        ('Admin User', 'admin@example.com', ?, true),
        ('Regular User', 'user@example.com', ?, false)
      `, [adminPassword, userPassword]);
      console.log('Sample users added to database');
    }
    
    connection.release();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// Initialize database on startup
initializeDatabase();

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Admin authorization middleware
const authorizeAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Admin privileges required' });
  }
  next();
};

// Auth routes

// Register new user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Required fields missing' });
    }
    
    // Check if user already exists
    const [existingUsers] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (existingUsers.length > 0) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword]
    );
    
    res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }
    
    // Find user
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const user = users[0];
    
    // Compare password
    const passwordMatch = await bcrypt.compare(password, user.password);
    
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// User routes

// Get current user
app.get('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, email, isAdmin, createdAt FROM users WHERE id = ?', [req.user.id]);
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(users[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const [users] = await pool.query('SELECT id, name, email, isAdmin, createdAt FROM users');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Product routes

// GET all products
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET product by ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST new product (admin only)
app.post('/api/products', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { name, description, price, category, quantity } = req.body;
    
    if (!name || !description || !price || !category) {
      return res.status(400).json({ message: 'Required fields missing' });
    }
    
    const [result] = await pool.query(
      'INSERT INTO products (name, description, price, category, quantity) VALUES (?, ?, ?, ?, ?)',
      [name, description, price, category, quantity || 0]
    );
    
    const [newProduct] = await pool.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    
    res.status(201).json(["Product added successfully", newProduct[0]]);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT update product (admin only)
app.put('/api/products/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { name, description, price, category, quantity } = req.body;
    const productId = req.params.id;
    
    // Check if product exists
    const [existingProduct] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    
    if (existingProduct.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Update product
    await pool.query(
      'UPDATE products SET name = ?, description = ?, price = ?, category = ?, quantity = ? WHERE id = ?',
      [
        name || existingProduct[0].name,
        description || existingProduct[0].description,
        price || existingProduct[0].price,
        category || existingProduct[0].category,
        quantity !== undefined ? quantity : existingProduct[0].quantity,
        productId
      ]
    );
    
    // Get updated product
    const [updatedProduct] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    
    res.json(["Product updated successfully", updatedProduct[0]]);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PATCH partially update product (admin only)
app.patch('/api/products/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const productId = req.params.id;
    const updates = req.body;
    
    // Check if product exists
    const [existingProduct] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    
    if (existingProduct.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Build dynamic query for partial update
    const fields = Object.keys(updates);
    if (fields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }
    
    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = fields.map(field => updates[field]);
    values.push(productId);
    
    // Update product
    await pool.query(`UPDATE products SET ${setClause} WHERE id = ?`, values);
    
    // Get updated product
    const [updatedProduct] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    
    res.json(["Product updated successfully", updatedProduct[0]]);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE product (admin only)
app.delete('/api/products/:id', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const productId = req.params.id;
    
    // Check if product exists
    const [existingProduct] = await pool.query('SELECT * FROM products WHERE id = ?', [productId]);
    
    if (existingProduct.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Delete product
    await pool.query('DELETE FROM products WHERE id = ?', [productId]);
    
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Order routes

// Create new order
app.post('/api/orders', authenticateToken, async (req, res) => {
  try {
    const { items } = req.body;
    const userId = req.user.id;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Order must contain at least one item' });
    }
    
    // Start transaction
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
          // Calculate total and verify product availability
          let totalAmount = 0;
      
          // Get all product IDs from order items
          const productIds = items.map(item => item.productId);
          
          // Fetch products in a single query
          const [products] = await connection.query(
            'SELECT id, name, price, quantity FROM products WHERE id IN (?)',
            [productIds]
          );
          
          // Create a map for quick product lookup
          const productMap = {};
          products.forEach(product => {
            productMap[product.id] = product;
          });
          
          // Validate each item and calculate total
          for (const item of items) {
            const product = productMap[item.productId];
            
            // Check if product exists
            if (!product) {
              await connection.rollback();
              connection.release();
              return res.status(404).json({ message: `Product with ID ${item.productId} not found` });
            }
            
            // Check if enough quantity is available
            if (product.quantity < item.quantity) {
              await connection.rollback();
              connection.release();
              return res.status(400).json({ 
                message: `Not enough inventory for ${product.name}. Available: ${product.quantity}, Requested: ${item.quantity}` 
              });
            }
            
            // Add to total
            totalAmount += product.price * item.quantity;
          }
          
          // Create order
          const [orderResult] = await connection.query(
            'INSERT INTO orders (userId, totalAmount, status) VALUES (?, ?, ?)',
            [userId, totalAmount, 'pending']
          );
          
          const orderId = orderResult.insertId;
          
          // Create order items and update product quantities
          for (const item of items) {
            const product = productMap[item.productId];
            
            // Add order item
            await connection.query(
              'INSERT INTO order_items (orderId, productId, quantity, price) VALUES (?, ?, ?, ?)',
              [orderId, item.productId, item.quantity, product.price]
            );
            
            // Update product quantity
            await connection.query(
              'UPDATE products SET quantity = quantity - ? WHERE id = ?',
              [item.quantity, item.productId]
            );
          }
          
          // Commit transaction
          await connection.commit();
          connection.release();
          
          // Get complete order with items
          const [orderDetails] = await pool.query(
            'SELECT * FROM orders WHERE id = ?',
            [orderId]
          );
          
          const [orderItems] = await pool.query(
            `SELECT oi.*, p.name, p.description 
             FROM order_items oi 
             JOIN products p ON oi.productId = p.id 
             WHERE oi.orderId = ?`,
            [orderId]
          );
          
          res.status(201).json({
            message: 'Order created successfully',
            order: {
              ...orderDetails[0],
              items: orderItems
            }
          });
          
        } catch (error) {
          // Rollback transaction on error
          await connection.rollback();
          connection.release();
          throw error;
        }
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    
    // Get user's orders
    app.get('/api/orders', authenticateToken, async (req, res) => {
      try {
        const userId = req.user.id;
        
        // Get all orders for the user
        const [orders] = await pool.query(
          'SELECT * FROM orders WHERE userId = ? ORDER BY createdAt DESC',
          [userId]
        );
        
        // Get items for each order
        const ordersWithItems = await Promise.all(orders.map(async (order) => {
          const [items] = await pool.query(
            `SELECT oi.*, p.name, p.description 
             FROM order_items oi 
             JOIN products p ON oi.productId = p.id 
             WHERE oi.orderId = ?`,
            [order.id]
          );
          
          return {
            ...order,
            items
          };
        }));
        
        res.json(ordersWithItems);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    
    // Get specific order
    app.get('/api/orders/:id', authenticateToken, async (req, res) => {
      try {
        const orderId = req.params.id;
        const userId = req.user.id;
        
        // Get order
        const [orders] = await pool.query(
          'SELECT * FROM orders WHERE id = ?',
          [orderId]
        );
        
        if (orders.length === 0) {
          return res.status(404).json({ message: 'Order not found' });
        }
        
        const order = orders[0];
        
        // Check if user is authorized to view this order
        if (order.userId !== userId && !req.user.isAdmin) {
          return res.status(403).json({ message: 'Not authorized to view this order' });
        }
        
        // Get order items
        const [items] = await pool.query(
          `SELECT oi.*, p.name, p.description 
           FROM order_items oi 
           JOIN products p ON oi.productId = p.id 
           WHERE oi.orderId = ?`,
          [orderId]
        );
        
        res.json({
          ...order,
          items
        });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    
    // Update order status (admin only)
    app.patch('/api/orders/:id/status', authenticateToken, authorizeAdmin, async (req, res) => {
      try {
        const orderId = req.params.id;
        const { status } = req.body;
        
        if (!status) {
          return res.status(400).json({ message: 'Status is required' });
        }
        
        // Valid statuses
        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ message: 'Invalid status' });
        }
        
        // Check if order exists
        const [orders] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        
        if (orders.length === 0) {
          return res.status(404).json({ message: 'Order not found' });
        }
        
        // Update order status
        await pool.query(
          'UPDATE orders SET status = ? WHERE id = ?',
          [status, orderId]
        );
        
        // Get updated order
        const [updatedOrder] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
        
        res.json({
          message: 'Order status updated successfully',
          order: updatedOrder[0]
        });
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    
    // Get all orders (admin only)
    app.get('/api/admin/orders', authenticateToken, authorizeAdmin, async (req, res) => {
      try {
        // Get all orders
        const [orders] = await pool.query('SELECT * FROM orders ORDER BY createdAt DESC');
        
        // Get user details for each order
        const ordersWithDetails = await Promise.all(orders.map(async (order) => {
          // Get user info
          const [users] = await pool.query(
            'SELECT id, name, email FROM users WHERE id = ?',
            [order.userId]
          );
          
          // Get order items
          const [items] = await pool.query(
            `SELECT oi.*, p.name 
             FROM order_items oi 
             JOIN products p ON oi.productId = p.id 
             WHERE oi.orderId = ?`,
            [order.id]
          );
          
          return {
            ...order,
            user: users[0],
            items
          };
        }));
        
        res.json(ordersWithDetails);
      } catch (error) {
        res.status(500).json({ message: error.message });
      }
    });
    
    // Start server
    app.listen(PORT, () => {
      console.log(`E-commerce API server running on port ${PORT}`);
    });
    