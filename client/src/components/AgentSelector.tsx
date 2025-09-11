import React from 'react';
import { THERAPEUTIC_AGENTS, TherapeuticAgent } from '../config/agent-configs';
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
      <div className="flex flex-col items-center gap-3 mb-4">
        <div className="flex items-center justify-center gap-2 w-full">
          <h3 className="text-base font-semibold text-foreground">Choose Your Guide</h3>
          <AIDisclosureCard />
        </div>
      </div>
      <div className="agent-grid">
        {THERAPEUTIC_AGENTS.map(agent => (
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