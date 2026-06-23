#!/bin/bash

echo "Setting up Dartmouth Degree Planner..."

# Install dependencies
echo "Installing dependencies..."
npm install

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Push database schema
echo "Setting up database..."
npx prisma db push

# Seed database
echo "Seeding database..."
npm run db:seed

echo "Setup complete! Run 'npm run dev' to start the development server."

