import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function HubAdminPayouts() {
  const navigate = useNavigate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { navigate('/hub/admin/payroll', { replace: true }); }, []);
  return null;
}
