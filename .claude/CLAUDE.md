# Project Context
This repository contains an implementation of the game "Settlers of Catan Duel".

## Core Directive: Game Logic & Assumptions
**NEVER assume game rules or logic.** 
Past assumptions about what constitutes "trivial" game mechanics have led to misunderstandings and flawed implementations. 

### Actionable Rules for the AI:
1. **Zero Guesswork:** If a specific game mechanic, edge case, or rule is not explicitly detailed by the user, **do not implement it**.
2. **Always Ask:** Whenever you encounter ambiguity or missing logic requirements, halt your implementation and explicitly ask the user for clarification.
3. **Strict Adherence:** Implement *only* the exact logic requested. Do not attempt to fill in gaps with standard Catan rules unless directly instructed to do so.