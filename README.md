# Financial Tracker - Financial Management System

A comprehensive financial management application built with Electron and SQLite, featuring cloud synchronization via Supabase.

## 📁 Project Structure

```
app/
├── backend/              # Backend (Electron Main Process)
│   ├── src/             # Main backend files
│   │   ├── main.js      # Application entry point
│   │   ├── database.js  # SQLite database management
│   │   ├── sync.js      # Supabase data synchronization
│   │   ├── backup.js    # Backup system
│   │   └── preload.js   # Preload Script
│   └── config/          # Configuration files
│       └── electron-builder.yml
│
├── frontend/            # Frontend (Electron Renderer Process)
│   ├── src/             # Frontend files
│   │   ├── *.html       # HTML pages
│   │   └── *.js         # JavaScript files
│   └── assets/          # Static resources
│       ├── css/         # CSS files
│       └── img/         # Images and icons
│
├── web/                 # Web Version (React App)
│   ├── src/             # React files
│   ├── public/          # Public files
│   └── build/           # Build files
│
├── docs/                # Documentation
│   ├── supabase_migration_add_time_to_payments.sql
│   └── syncCustomers.mjs
│
├── shared/              # Shared files
│
├── package.json         # Main project configuration
├── pos_system.db        # SQLite database
└── .env                 # Environment variables (must be created)
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Supabase account (for cloud synchronization)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd app
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Create a `.env` file in the root directory:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

4. **Run the application**

```bash
# Run Electron app
npm start

# Or run web version
npm run start:web
```

## 📦 Build & Distribution

### Build Electron App

```bash
npm run build
```

The installer will be created in the `build/` folder.

### Build Web Version

```bash
cd web
npm install
npm run build
```

## 🏗️ Architecture

### Backend (Electron Main Process)

- **main.js**: Entry point, window management, IPC handlers
- **database.js**: SQLite database management
- **sync.js**: Supabase data synchronization
- **backup.js**: Automatic backup system

### Frontend (Electron Renderer Process)

- **index.html**: Main page - financial transaction tracking
- **products.html**: Product and inventory management
- **customers.html**: Customer management
- **customer.html**: Customer account page
- **alerts.html**: Low stock alerts

### Web (React App)

Separate React application for browser access, using the same cloud database.

## 🔧 Key Features

### 1. Financial Transaction Management
- Record income and expenses
- Search and filter by date
- Automatic financial summary

### 2. Product Management
- Add and edit products
- Inventory tracking
- Low stock alerts
- Multiple pricing (retail, wholesale, purchase)

### 3. Customer Management
- Add and edit customers
- Account tracking
- Payment recording
- Transaction history

### 4. Cloud Synchronization
- Automatic synchronization with Supabase
- Offline mode support
- Sync queue management

### 5. Backup System
- Automatic daily backups
- Restore from backup
- Backup management

## 📊 Database

### Main Tables

- **products**: Products and inventory
- **customers**: Customers
- **sales**: Sales records
- **payments**: Payments
- **transactions**: Financial transactions
- **customer_transactions**: Customer transactions

## 🔐 Security

- Use `.env` to store API keys
- Local database protection
- Secure synchronization via Supabase

## 📝 Development

### Adding a New Feature

1. **Backend**: Add IPC handler in `main.js`
2. **Frontend**: Add functionality in appropriate JS file
3. **Database**: Update tables in `database.js` if needed

### IPC Structure

The application uses IPC (Inter-Process Communication) for communication between Main and Renderer:

```javascript
// In Renderer
ipcRenderer.invoke('get-products')

// In Main
ipcMain.handle('get-products', async (event) => {
  // Code here
})
```

## 🐛 Troubleshooting

### Common Issues

1. **Supabase Connection Error**
   - Check `.env` file
   - Verify API keys are correct

2. **Database Error**
   - Check if `pos_system.db` exists
   - Verify file permissions

3. **Path Issues**
   - Ensure correct relative paths are used
   - Verify folder structure

## 📄 License

MIT License

## 👤 Author

**Youssef Elkhyoty**

## 🙏 Acknowledgments

This project was developed by Johnny Cash (Youssef Elkhyoty)

---

**Note**: Make sure to create the `.env` file before running the application for the first time.
