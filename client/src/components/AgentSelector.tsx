import React from 'react';
import { ALL_AGENTS as THERAPEUTIC_AGENTS, TherapeuticAgent } from '../config';
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
  return (
    <div className="agent-selector">
      <div className="flex items-center justify-center gap-2 mb-6">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">Choose Your Guide</h3>
        <AIDisclosureCard />
      </div>
      <div className="agent-grid">
        {THERAPEUTIC_AGENTS.map(agent => (
          <button
            key={agent.id}
            className={`agent-card-with-image ${selectedAgentId === agent.id ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => !disabled && onSelectAgent(agent.id)}
            disabled={disabled}
            data-testid={`agent-selector-${agent.id}`}
            style={{
              backgroundImage: `url(${agent.image})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            <div className="agent-card-overlay">
              <h4 className="agent-name">{agent.name}</h4>
              <p className="agent-description">{agent.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default AgentSelector;