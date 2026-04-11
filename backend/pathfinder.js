// backend/pathfinder.js

// A* Pathfinding Algorithm Implementation

// A simple Priority Queue for the open set
class PriorityQueue {
  constructor() {
    this.elements = [];
  }

  enqueue(element, priority) {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority);
  }

  dequeue() {
    return this.elements.shift().element;
  }

  isEmpty() {
    return this.elements.length === 0;
  }
}

// Heuristic function (Euclidean distance)
function heuristic(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

/**
 * A* search algorithm
 * @param {object} graph - The graph representing the map
 * @param {string} startNodeId - The ID of the starting node
 * @param {string} goalNodeId - The ID of the goal node
 * @returns {Array|null} - The path from start to goal, or null if no path
 */
function aStarSearch(graph, startNodeId, goalNodeId) {
  const startNode = graph.nodes[startNodeId];
  const goalNode = graph.nodes[goalNodeId];

  if (!startNode || !goalNode) {
    console.error("Start or Goal node not found in graph.");
    return null;
  }

  const frontier = new PriorityQueue();
  frontier.enqueue(startNode, 0);

  const cameFrom = { [startNodeId]: null };
  const costSoFar = { [startNodeId]: 0 };

  while (!frontier.isEmpty()) {
    const current = frontier.dequeue();

    if (current.id === goalNodeId) {
      // Reconstruct path
      let path = [];
      let temp = current;
      while (temp) {
        path.push(temp);
        temp = cameFrom[temp.id] ? graph.nodes[cameFrom[temp.id]] : null;
      }
      return path.reverse();
    }

    for (const neighborId of current.neighbors) {
      const neighbor = graph.nodes[neighborId];
      // Apply terrain/damage cost
      const edgeCost = current.costs ? (current.costs[neighborId] || 1) : 1;
      const newCost = costSoFar[current.id] + edgeCost;

      if (costSoFar[neighborId] === undefined || newCost < costSoFar[neighborId]) {
        costSoFar[neighborId] = newCost;
        const priority = newCost + heuristic(neighbor, goalNode);
        frontier.enqueue(neighbor, priority);
        cameFrom[neighborId] = current.id;
      }
    }
  }

  return null; // No path found
}


// --- Placeholder Data ---
// This simulates a pre-loaded, offline road network and terrain data.
const tacticalGraph = {
  nodes: {
    'A': { id: 'A', x: 1, y: 1, neighbors: ['B', 'D'] },
    'B': { id: 'B', x: 3, y: 1, neighbors: ['A', 'C', 'E'], costs: { 'C': 2.5 } }, // Higher cost to C (rough terrain)
    'C': { id: 'C', x: 5, y: 1, neighbors: ['B', 'F'] },
    'D': { id: 'D', x: 1, y: 3, neighbors: ['A', 'E', 'G'] },
    'E': { id: 'E', x: 3, y: 3, neighbors: ['B', 'D', 'F', 'H'] },
    'F': { id: 'F', x: 5, y: 3, neighbors: ['C', 'E', 'I'] },
    'G': { id: 'G', x: 1, y: 5, neighbors: ['D', 'H'] },
    'H': { id: 'H', x: 3, y: 5, neighbors: ['E', 'G', 'I'] },
    'I': { id: 'I', x: 5, y: 5, neighbors: ['F', 'H'] },
  },
};

/**
 * Finds the fastest path between two points in the tactical graph.
 * @param {string} startNodeId 
 * @param {string} goalNodeId 
 * @param {object} modifications - Optional modifications, e.g., { destroyed: ['B'] }
 * @returns {object} - An object containing the path and travel time (cost)
 */
function findPath(startNodeId, goalNodeId, modifications = {}) {
  let currentGraph = JSON.parse(JSON.stringify(tacticalGraph)); // Deep copy to apply modifications

  // Apply 'what-if' modifications
  if (modifications.destroyed) {
    modifications.destroyed.forEach(destroyedNodeId => {
      if (currentGraph.nodes[destroyedNodeId]) {
        // Remove node and all edges pointing to it
        delete currentGraph.nodes[destroyedNodeId];
        Object.values(currentGraph.nodes).forEach(node => {
          node.neighbors = node.neighbors.filter(n => n !== destroyedNodeId);
        });
      }
    });
  }
  
  const path = aStarSearch(currentGraph, startNodeId, goalNodeId);
  
  if (!path) {
    return { path: null, travelTime: Infinity, message: "No path found." };
  }
  
  const travelTime = path.reduce((acc, node, i) => {
    if (i === 0) return 0;
    const prevNode = path[i-1];
    const edgeCost = prevNode.costs ? (prevNode.costs[node.id] || 1) : 1;
    return acc + edgeCost;
  }, 0);

  return {
    path: path.map(p => p.id),
    travelTime: travelTime,
  };
}

module.exports = { findPath };
