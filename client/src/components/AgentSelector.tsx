import React from 'react';
import { getUserSelectableAgents, TherapeuticAgent } from '../config/agent-configs';
import { AIDisclosureCard } from './AIDisclosureCard';

interface AgentSelectorProps {
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  disabled?: boolean;
}

const AgentSelector: React.FC<AgentSelectorProps> = ({ 
  selectedAgentId, 
  onSelectAgent, 
  disabled 
}) => {
  // Only show agents where userSelectable !== false (excludes Zhanna)
  const agents = getUserSelectableAgents();
  
  return (
    <div className="agent-selector">
      <div className="flex items-center justify-center gap-2 mb-6">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">Choose Your Guide</h3>
        <AIDisclosureCard />
      </div>
      <div className="agent-grid">
        {agents.map(agent => (
          <button
            key={agent.id}
            className={`agent-card ${selectedAgentId === agent.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => !disabled && onSelectAgent(agent.id)}
            disabled={disabled}
            data-testid={`agent-selector-${agent.id}`}
          >
            <div className="agent-icon">{agent.icon}</div>
            <h4 className="agent-name">{agent.name}</h4>
            <p className="agent-description">{agent.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AgentSelector;