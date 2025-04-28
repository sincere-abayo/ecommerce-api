const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Sample data
let products = [
  {
    id: '1',
    name: 'iPhone 13',
    description: 'Latest iPhone with A15 Bionic chip',
    price: 999.99,
    category: 'Electronics',
    imageUrl: 'https://example.com/iphone13.jpg',
    stock: 50,
    createdAt: new Date()
  },
  {
    id: '2',
    name: 'Samsung Galaxy S21',
    description: 'Flagship Android smartphone with 120Hz display',
    price: 799.99,
    category: 'Electronics',
    imageUrl: 'https://example.com/galaxys21.jpg',
    stock: 35,
    createdAt: new Date()
  },
  {
    id: '3',
    name: 'Nike Air Max',
    description: 'Comfortable running shoes with air cushioning',
    price: 129.99,
    category: 'Footwear',
    imageUrl: 'https://example.com/airmax.jpg',
    stock: 100,
    createdAt: new Date()
  },
  {
    id: '4',
    name: 'Levi\'s 501 Jeans',
    description: 'Classic straight fit denim jeans',
    price: 59.99,
    category: 'Clothing',
    imageUrl: 'https://example.com/levis501.jpg',
    stock: 200,
    createdAt: new Date()
  },
  {
    id: '5',
    name: 'Sony WH-1000XM4',
    description: 'Wireless noise-cancelling headphones',
    price: 349.99,
    category: 'Electronics',
    imageUrl: 'https://example.com/sonywh1000xm4.jpg',
    stock: 25,
    createdAt: new Date()
  }
];

let users = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    password: 'password123',
    isAdmin: true,
    createdAt: new Date()
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    password: 'password123',
    isAdmin: false,
    createdAt: new Date()
  }
];

let orders = [];

// Routes

// Product routes
app.get('/api/products', (req, res) => {
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

app.post('/api/products', (req, res) => {
  const product = {
    id: (products.length + 1).toString(),
    ...req.body,
    createdAt: new Date()
  };
  products.push(product);
  res.status(201).json(product);
});

app.put('/api/products/:id', (req, res) => {
  const index = products.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Product not found' });
  
  products[index] = {
    ...products[index],
    ...req.body
  };
  
  res.json(products[index]);
});

app.delete('/api/products/:id', (req, res) => {
  const index = products.findIndex(p => p.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Product not found' });
  
  const deletedProduct = products[index];
  products = products.filter(p => p.id !== req.params.id);
  
  res.json({ message: 'Product deleted successfully' });
});

// User routes
app.post('/api/users/register', (req, res) => {
  const { name, email, password } = req.body;
  const userExists = users.find(u => u.email === email);
  
  if (userExists) {
    return res.status(400).json({ message: 'User already exists' });
  }
  
  const user = {
    id: (users.length + 1).toString(),
    name,
    email,
    password,
    isAdmin: false,
    createdAt: new Date()
  };
  
  users.push(user);
  
  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin
  });
});

app.post('/api/users/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  
  if (user && user.password === password) {
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin
    });
  } else {
    res.status(401).json({ message: 'Invalid email or password' });
  }
});

// Get all users (admin only in a real app)
app.get('/api/users', (req, res) => {
  const usersWithoutPasswords = users.map(user => {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  });
  res.json(usersWithoutPasswords);
});

// Order routes
app.post('/api/orders', (req, res) => {
  const { user, products: orderProducts, totalAmount } = req.body;
  
  // Validate user exists
  const userExists = users.find(u => u.id === user);
  if (!userExists) {
    return res.status(400).json({ message: 'User not found' });
  }
  
  const order = {
    id: (orders.length + 1).toString(),
    user,
    products: orderProducts,
    totalAmount,
    status: 'pending',
    createdAt: new Date()
  };
  
  orders.push(order);
  res.status(201).json(order);
});

app.get('/api/orders/:userId', (req, res) => {
  const userOrders = orders.filter(order => order.user === req.params.userId);
  
  // Enhance orders with user and product details
  const enhancedOrders = userOrders.map(order => {
    const user = users.find(u => u.id === order.user);
    const { password, ...userWithoutPassword } = user;
    
    const enhancedProducts = order.products.map(item => {
      const product = products.find(p => p.id === item.product);
      return {
        ...item,
        productDetails: product
      };
    });
    
    return {
      ...order,
      userDetails: userWithoutPassword,
      products: enhancedProducts
    };
  });
  
  res.json(enhancedOrders);
});

// Start server
app.listen(PORT, () => {
  console.log(`E-commerce API server running on port ${PORT}`);
});
