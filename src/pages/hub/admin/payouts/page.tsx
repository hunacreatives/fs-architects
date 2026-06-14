import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HubAdminPayouts() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/hub/admin/payroll', { replace: true }); }, []);
  return null;
}
