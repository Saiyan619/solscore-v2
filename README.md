# SolScore v2

A decentralized sports Prediction platform built on Solana that enables transparent, trustless wagering on sports events with SPL token integration.

## Overview

SolScore is a smart contract-powered Prediction protocol that allows users to make predictions on football league winners across multiple leagues. The platform uses Program Derived Addresses (PDAs) for secure fund management and automated payout distribution to winning bettors.

## Features

- **Multi-Sport Support**: Create betting markets for any football league (EPL,Ligue 1, Laliga etc.)
- **SPL Token Integration**: Place bets using any SPL token with customizable odds
- **Automated Payouts**: Winners claim their payouts directly from the smart contract
- **Transparent Resolution**: Market outcomes are resolved on-chain by authorized admins
- **Vault Security**: Funds are held in secure PDAs with automatic liquidity management
- **Configurable Markets**: Set maximum stake amounts and bettor limits per market

## Architecture

Built with:
- **Anchor Framework** - Solana smart contract development
- **Rust** - Program logic
- **TypeScript** - Testing suite and SDK
- **SPL Token Program** - Token transfers and account management

##  Smart Contract Instructions

1. `initialize_market` - Create a new betting market with teams, odds, and limits
2. `place_bet` - Users stake tokens on their predicted outcome
3. `resolve_market` - Admin declares the winning team
4. `claim_payout` - Winners claim their earnings based on odds
5. `close_market` - Admin recovers remaining vault funds post-resolution

##  Testing

Comprehensive test suite covering:
- Market initialization and validation
- Bet placement with amount/index checks
- Market resolution mechanics
- Payout calculations and claims
- Access control and error handling

Tested on both **localnet** and **devnet** environments.

##  Getting Started

```bash
# Install dependencies
yarn install

# Build the program
anchor build

# Run tests
anchor test

**Disclaimer**: This is a demo project for educational purposes. Always conduct thorough audits before deploying betting protocols to mainnet.
