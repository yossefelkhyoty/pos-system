# Web App - Financial Tracker

React web application for Financial Tracker.

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file
echo "REACT_APP_SUPABASE_URL=your-url" > .env
echo "REACT_APP_SUPABASE_ANON_KEY=your-key" >> .env

# Start development server
npm start
```

## Environment Variables

Create `.env` file in the `web/` directory:

```env
REACT_APP_SUPABASE_URL=https://xxxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

## Available Scripts

- `npm start` - Start development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

## Structure

- `src/App.jsx` - Main app component
- `src/AdminApp.jsx` - Admin dashboard
- `src/CustomerPortal.jsx` - Customer portal
- `src/supabaseClient.jsx` - Supabase client configuration

## Deploy

```bash
npm run build
```

The `build` folder contains the production-ready files.
