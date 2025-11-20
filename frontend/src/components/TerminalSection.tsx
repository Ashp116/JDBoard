import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { TerminalSectionProps } from '../types';
import { getBackendUrl } from '../utils/api';
import packageJson from "../../package.json"

const Container = styled.div`
  padding: 30px;
  height: calc(100vh - 60px); /* Account for mobile header on all screens */
  display: flex;
  flex-direction: column;
  
  ${props => props.theme.media.mobile} {
    padding: 15px;
    height: calc(100vh - 180px); /* Account for mobile header + extra spacing */
  }
  
  @media (max-width: 480px) {
    padding: 10px;
    height: calc(100vh - 200px); /* Account for smaller mobile header + more spacing */
  }
  
  ${props => props.theme.media.tablet} {
    padding: 20px;
    height: calc(100vh - 160px);
  }
  
  /* Desktop */
  @media (min-width: 992px) {
    height: calc(100vh - 60px);
    padding: 30px;
  }
`;

const SectionHeader = styled.div`
  margin-bottom: 30px;
  padding-bottom: 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  
  ${props => props.theme.media.mobile} {
    margin-bottom: 20px;
    padding-bottom: 10px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    color: ${props => props.theme.colors.text.primary};
    font-size: 24px;
    margin: 0;
    font-family: ${props => props.theme.fonts.display};
    
    ${props => props.theme.media.mobile} {
      font-size: 20px;
      gap: 8px;
    }
    
    @media (max-width: 480px) {
      font-size: 18px;
      gap: 6px;
    }

    i {
      color: ${props => props.theme.colors.nvidia.green};
    }
  }
`;

const TerminalContainer = styled.div`
  flex: 1;
  background: #0c0c0c;
  border: 1px solid ${props => props.theme.colors.border.secondary};
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const TerminalHeader = styled.div`
  background: ${props => props.theme.colors.background.secondary};
  padding: 10px 15px;
  border-bottom: 1px solid ${props => props.theme.colors.border.secondary};
  display: flex;
  align-items: center;
  
  ${props => props.theme.media.mobile} {
    padding: 8px 12px;
  }
  
  @media (max-width: 480px) {
    padding: 6px 10px;
  }

  .terminal-title {
    color: ${props => props.theme.colors.text.secondary};
    font-size: 14px;
    font-weight: 500;
    
    ${props => props.theme.media.mobile} {
      font-size: 13px;
    }
    
    @media (max-width: 480px) {
      font-size: 12px;
    }
  }
`;

const TerminalOutput = styled.div`
  flex: 1;
  padding: 15px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.4;
  color: #00ff00;
  background: #0c0c0c;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  min-height: 200px;
  max-height: 400px;
  
  ${props => props.theme.media.mobile} {
    padding: 10px;
    font-size: 12px;
    line-height: 1.3;
    min-height: 150px;
    max-height: 300px;
  }
  
  @media (max-width: 480px) {
    padding: 8px;
    font-size: 11px;
    min-height: 120px;
    max-height: 250px;
  }

  .prompt {
    color: #4ECDC4;
  }

  .command {
    color: #ffffff;
  }

  .output {
    color: #cccccc;
  }

  .error {
    color: #ff6b6b;
  }
`;

const TerminalInputContainer = styled.div`
  display: flex;
  align-items: center;
  padding: 10px 15px;
  background: #0c0c0c;
  border-top: 1px solid ${props => props.theme.colors.border.secondary};
  
  ${props => props.theme.media.mobile} {
    padding: 8px 10px;
  }
  
  @media (max-width: 480px) {
    padding: 6px 8px;
  }

  .prompt {
    color: #4ECDC4;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    margin-right: 8px;
    
    ${props => props.theme.media.mobile} {
      font-size: 12px;
      margin-right: 6px;
    }
    
    @media (max-width: 480px) {
      font-size: 11px;
      margin-right: 4px;
    }
  }
`;

const TerminalInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: #ffffff;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  outline: none;
  caret-color: #00ff00;
  
  ${props => props.theme.media.mobile} {
    font-size: 12px;
  }
  
  @media (max-width: 480px) {
    font-size: 11px;
  }

  &::placeholder {
    color: #666666;
  }
  
  &:focus {
    outline: none;
    box-shadow: none;
  }
`;

interface TerminalLine {
  type: 'prompt' | 'command' | 'output' | 'error';
  content: string;
  timestamp: Date;
}

const TerminalSection: React.FC<TerminalSectionProps> = ({ socket, isConnected }) => {
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    {
      type: 'output',
      content: `Welcome to JBoard Terminal v${packageJson.version}`,
      timestamp: new Date()
    },
    {
      type: 'output',
      content: 'Type "help" for available commands.',
      timestamp: new Date()
    }
  ]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentDirectory, setCurrentDirectory] = useState('~');
  const [sessionId] = useState('default');
  const [tabCompletions, setTabCompletions] = useState<string[]>([]);
  const [completionIndex, setCompletionIndex] = useState(-1);
  const [originalCommand, setOriginalCommand] = useState('');
  const [userInfo, setUserInfo] = useState({
    username: 'user',
    hostname: 'jetsonboard',
    home_dir: '/home/user'
  });
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Helper function to format directory path for display
  const formatPath = (path: string) => {
    // Replace actual home directory with ~
    return path.replace(userInfo.home_dir, '~');
  };

  // Auto-focus terminal input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Refocus input when clicking anywhere in terminal
  const handleTerminalClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // Auto-scroll to bottom when new content is added
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalLines]);

  // Focus input when component mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Fetch user information on component mount
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch(`${getBackendUrl()}/terminal/userinfo`);
        const result = await response.json();
        
        if (result.success) {
          setUserInfo({
            username: result.username,
            hostname: result.hostname,
            home_dir: result.home_dir
          });
          
          // Update current directory to use actual home directory
          setCurrentDirectory(result.home_dir);
        }
      } catch (error) {
        console.error('Failed to fetch user info:', error);
      }
    };

    fetchUserInfo();
  }, []);

  const addTerminalLine = (type: TerminalLine['type'], content: string) => {
    setTerminalLines(prev => [...prev, {
      type,
      content,
      timestamp: new Date()
    }]);
  };

  const executeCommand = async (command: string) => {
    if (!command.trim()) return;

    // Add command to terminal with current directory in prompt
    const promptPath = formatPath(currentDirectory);
    addTerminalLine('prompt', `${userInfo.username}@${userInfo.hostname}:${promptPath}$ ${command}`);

    // Add to history
    setCommandHistory(prev => [...prev, command]);
    setHistoryIndex(-1);

    try {
      const response = await fetch(`${getBackendUrl()}/terminal/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          command: command.trim(),
          session_id: sessionId
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Update current directory if provided
        if (result.cwd) {
          setCurrentDirectory(result.cwd);
        }
        
        if (result.output) {
          addTerminalLine('output', result.output);
        }
        if (result.error) {
          addTerminalLine('error', result.error);
        }
      } else {
        addTerminalLine('error', result.error || 'Command execution failed');
        
        // Still update directory if provided (for error cases like cd to non-existent dir)
        if (result.cwd) {
          setCurrentDirectory(result.cwd);
        }
      }
    } catch (error) {
      addTerminalLine('error', `Error: Unable to execute command - ${error}`);
    }
  };

  const handleTabCompletion = async () => {
    if (!currentCommand.trim()) return;

    try {
      const response = await fetch(`${getBackendUrl()}/terminal/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partial_command: currentCommand,
          session_id: sessionId
        }),
      });

      const result = await response.json();

      if (result.success && result.completions.length > 0) {
        const completions = result.completions;
        
        if (completions.length === 1) {
          // Single completion - auto-complete
          const completion = completions[0];
          const parts = currentCommand.split(' ');
          const lastPart = parts[parts.length - 1];
          
          // Replace the last part with the completion
          parts[parts.length - 1] = completion;
          setCurrentCommand(parts.join(' '));
          
          // Clear completion state
          setTabCompletions([]);
          setCompletionIndex(-1);
          setOriginalCommand('');
        } else {
          // Multiple completions - show them and set up cycling
          setTabCompletions(completions);
          setCompletionIndex(0);
          setOriginalCommand(currentCommand);
          
          // Apply first completion
          const completion = completions[0];
          const parts = currentCommand.split(' ');
          parts[parts.length - 1] = completion;
          setCurrentCommand(parts.join(' '));
        }
      }
    } catch (error) {
      console.error('Tab completion error:', error);
    }
  };

  const cycleCompletion = () => {
    if (tabCompletions.length > 0) {
      const nextIndex = (completionIndex + 1) % tabCompletions.length;
      setCompletionIndex(nextIndex);
      
      const completion = tabCompletions[nextIndex];
      const parts = originalCommand.split(' ');
      parts[parts.length - 1] = completion;
      setCurrentCommand(parts.join(' '));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentCommand.trim()) {
      executeCommand(currentCommand);
      setCurrentCommand('');
      // Clear tab completion state
      setTabCompletions([]);
      setCompletionIndex(-1);
      setOriginalCommand('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (tabCompletions.length > 0) {
        // Cycle through existing completions
        cycleCompletion();
      } else {
        // Start new tab completion
        handleTabCompletion();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // Clear tab completion state when using history
      setTabCompletions([]);
      setCompletionIndex(-1);
      setOriginalCommand('');
      
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Clear tab completion state when using history
      setTabCompletions([]);
      setCompletionIndex(-1);
      setOriginalCommand('');
      
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCurrentCommand(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentCommand('');
      }
    } else {
      // Clear tab completion state on any other key press
      if (e.key !== 'Tab') {
        setTabCompletions([]);
        setCompletionIndex(-1);
        setOriginalCommand('');
      }
    }
  };

  const clearTerminal = () => {
    setTerminalLines([
      {
        type: 'output',
        content: 'Terminal cleared.',
        timestamp: new Date()
      }
    ]);
  };

  return (
    <Container>
      <SectionHeader>
        <h2>
          <i className="fas fa-terminal"></i>
          Terminal
        </h2>
      </SectionHeader>

      <TerminalContainer onClick={() => inputRef.current?.focus()}>
        <TerminalHeader>
          <div className="terminal-title">JBoard Terminal</div>
        </TerminalHeader>

        <TerminalOutput ref={outputRef}>
          {terminalLines.map((line, index) => (
            <div key={index} className={line.type}>
              {line.content}
            </div>
          ))}
        </TerminalOutput>

        <form onSubmit={handleSubmit}>
          <TerminalInputContainer>
            <span className="prompt">
              {userInfo.username}@{userInfo.hostname}:{formatPath(currentDirectory)}$
            </span>
            <TerminalInput
              ref={inputRef}
              type="text"
              value={currentCommand}
              onChange={(e) => setCurrentCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command..."
              disabled={!isConnected}
              autoFocus
            />
          </TerminalInputContainer>
        </form>
      </TerminalContainer>
    </Container>
  );
};

export default TerminalSection;