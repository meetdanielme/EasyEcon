# EasyEcon

**Interactive Supply, Demand & Equilibrium Study Tool**

EasyEcon is a browser-based, interactive economics study tool designed for introductory economics courses. It visualizes core microeconomic concepts — supply and demand, market equilibrium, elasticity, and types of goods — using dynamic HTML5 Canvas graphs and intuitive controls.

## Features

### 📈 Interactive Supply & Demand Graph
- Drag sliders to **shift** supply and demand curves left or right (simulating non-price factors)
- Adjust **elasticity** to see how responsiveness changes curve slopes
- Toggle **price floor** and **price ceiling** controls to explore government intervention
- View **consumer surplus** shading and the **equilibrium point** in real time
- Choose from built-in **scenarios** (demand shifts, supply shifts, combined shifts, price controls) with detailed explanations of cause, mechanism, and result

### 📊 Elasticity Explorer
Explore four types of elasticity with dedicated interactive graphs and reference tables:
- **PED** — Price Elasticity of Demand
- **PES** — Price Elasticity of Supply
- **IED** — Income Elasticity of Demand
- **CED** — Cross-Price Elasticity of Demand

Each section includes adjustable sliders, preset classifications (perfectly inelastic → perfectly elastic), determinant summaries, and real-world examples.

### 🏷️ Types of Goods
Visual cards with mini-graphs for six good categories:
- **Normal Goods** (necessities & luxuries)
- **Inferior Goods**
- **Giffen Goods**
- **Veblen Goods**
- **Substitutes**
- **Complements**

### 📝 Key Formulae
Quick-reference cards covering essential economics formulae including PED, PES, IED, CED, Total Revenue, Consumer Surplus, Total Cost, Average Costs, Marginal Cost, and Marginal Product.

## Getting Started

EasyEcon is a static web app with **no build step and no dependencies**. To run it locally:

1. Clone the repository:
   ```bash
   git clone https://github.com/meetdanielme/EasyEcon.git
   cd EasyEcon
   ```
2. Open `index.html` in your browser, or serve it with any static file server:
   ```bash
   # Python
   python3 -m http.server

   # Node.js (npx)
   npx serve
   ```
3. Navigate to `http://localhost:8000` (or the port shown) in your browser.

## Project Structure

```
EasyEcon/
├── index.html   # Page structure and all tab content
├── app.js       # Application logic, canvas rendering, and interactivity
├── styles.css   # Styling and responsive layout
└── .gitignore
```

## Technologies

- **HTML5 Canvas** for all graph rendering
- **Vanilla JavaScript** (no frameworks or libraries)
- **CSS3** with custom properties and responsive media queries

## License

This project does not currently include a license. All rights are reserved by the author.
